/* Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.togetherflow.resignation;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.flowable.cmmn.api.runtime.CaseInstance;
import org.flowable.common.engine.impl.identity.Authentication;
import org.flowable.task.api.Task;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Walks a resignation from the ASE logging it to HRM closing the file - the fifteen rows of
 * Resignation_Process.xlsx, in order.
 *
 * <p>The walk is the assertion. Every {@code complete(...)} insists that exactly one task with
 * that key is open, so a step reached too early, too late or twice fails here rather than
 * looking like a passing test of a different process.
 */
class SalesResignationCaseTest extends ResignationEngineTest {

    private static final String ASE = "imran.kabir";
    private static final String EMPLOYEE = "MPE-10428";
    private static final String EMPLOYEE_USER = "rakib.hasan";

    private CaseInstance caseInstance;
    private Task lastClearanceTask;

    @BeforeEach
    void startResignation() {
        deployModels();
        Authentication.setAuthenticatedUserId(ASE);
        caseInstance = cmmnRuntimeService.createCaseInstanceBuilder()
                .caseDefinitionKey("salesResignation")
                .name("Resignation - Rakib Hasan")
                .variables(Map.of(
                        "employeeId", EMPLOYEE,
                        "employeeUserId", EMPLOYEE_USER,
                        "employeeName", "Rakib Hasan",
                        "employeeDesignation", "MPE",
                        "employeeTerritory", "Khulna North",
                        "resignationLetterRef", "attachment:resignation-letter:MPE-10428"))
                .start();
    }

    @AfterEach
    void clearAuthentication() {
        Authentication.setAuthenticatedUserId(null);
    }

    @Test
    @DisplayName("the whole spreadsheet, step 1 to step 15")
    void runsTheResignationToPreservation() {
        // Step 1: logging the resignation mails HRM and ACC immediately, and puts the sales
        // clearance in front of the ASE who logged it.
        assertThat(notifier.events()).containsExactly("RESIGNATION_LOGGED");
        assertThat(openTaskKeys()).containsExactly("aseClearance");
        assertThat(taskFor("aseClearance").getAssignee())
                .as("the clearance form appears for the ASE who logged the resignation")
                .isEqualTo(ASE);

        complete("aseClearance", Map.of(
                "outstandingCollection", 0d,
                "stockReturned", true,
                "samplesReturned", true,
                "decision", "approve"));

        // Step 2: up the sales line, one level at a time.
        approve("rseApproval");
        assertThat(notifier.events()).contains("RSE_APPROVED");
        approve("zsiApproval");
        approve("smApproval");
        approve("gmApproval");

        // Step 3: SSR splits the two documents - Director Marketing signs the letter while
        // SIMU and IB clear the sales clearance on the way to SBM.
        complete("ssrReceiveDocuments", Map.of("resignationLetterReceived", true, "salesClearanceReceived", true));
        assertThat(openTaskKeys())
                .as("both of SSR's tracks are open at once")
                .containsExactly("directorMarketingSignature", "ibClearance", "simuClearance");

        approve("directorMarketingSignature");
        complete("simuClearance", Map.of("duesOutstanding", 0d, "itemsReturned", true));
        complete("ibClearance", Map.of("duesOutstanding", 0d, "itemsReturned", true));

        // Steps 4 to 6: the three departmental clearances, independent of each other.
        assertThat(openTaskKeys()).containsExactly("issueClearance", "issueClearance", "issueClearance");
        completeClearance(ResignationRoles.SBM, Map.of("sbmStockAdjusted", true, "sbmDuesOutstanding", 0d));
        assertThat(lastClearanceTask.getName()).isEqualTo("SBM - generate the SBM clearance");
        assertThat(lastClearanceTask.getFormKey())
                .as("one process, three departments: the name and the form come from the case")
                .isEqualTo("sbmClearanceForm");
        completeClearance(ResignationRoles.GAD, Map.of("motorcycleIssued", true, "motorcycleRegistration", "DHA-12-3456"));
        completeClearance(ResignationRoles.FCA, Map.of("fcaAdvanceOutstanding", 0d, "fcaLoanOutstanding", 0d));

        // Step 7: HRM checks that all five documents arrived.
        complete("hrmVerifyDocuments", Map.of(
                "hasResignationLetter", true,
                "hasSalesClearance", true,
                "hasSbmClearance", true,
                "hasMotorcycleClearance", true,
                "hasFcaClearance", true));

        // Step 8: the acceptance of resignation is generated, signed, circulated and filed.
        approve("headOfHrSignature");
        complete("updateClearanceStatusRecord", Map.of("clearanceStatus", "Cleared"));
        assertThat(notifier.events()).contains("ACCEPTANCE_CIRCULATED", "DOCUMENTS_SHARED_WITH_ACC");
        assertThat(notifier.sent())
                .as("the letter reaches the resigning employee as a person, and the two desks as groups")
                .contains("ACCEPTANCE_SENT_TO_EMPLOYEE|" + EMPLOYEE + "|" + EMPLOYEE_USER,
                        "ACCEPTANCE_CIRCULATED|" + EMPLOYEE + "|sales-ssr,reception");

        // Steps 9 to 14: the final settlement, drafted once and signed four times.
        complete("prepareFinalSettlement", Map.of("salaryDue", 48500d, "netPayable", 61200d));
        approve("accManagerApproval");
        approve("accDirectorApproval");
        complete("hrmUpdateEbsRecord", Map.of("ebsReference", "EBS-2026-0413", "ebsStatusUpdated", true));
        approve("headOfHrSettlementSignature");
        complete("completeFinalSettlement");

        // Step 15: HRM preserves the file, and the case closes.
        complete("preserveEmployeeFile", Map.of("employeeFileReference", "HR/SALES/2026/0413", "documentsPreserved", 7));

        assertThat(cmmnRuntimeService.createCaseInstanceQuery().caseInstanceId(caseInstance.getId()).count())
                .as("the case is over")
                .isZero();
        assertThat(openTaskKeys()).isEmpty();
    }

    @Test
    @DisplayName("the case file names every document the system generated")
    void collectsTheGeneratedDocuments() {
        runsTheResignationToPreservation();

        Map<String, Object> variables = cmmnEngineConfiguration.getCmmnHistoryService()
                .createHistoricCaseInstanceQuery()
                .caseInstanceId(caseInstance.getId())
                .includeCaseVariables()
                .singleResult()
                .getCaseVariables();

        assertThat(variables)
                .containsEntry("sbmClearanceRef", "doc:SBM_CLEARANCE:" + EMPLOYEE)
                .containsEntry("motorcycleClearanceRef", "doc:MOTORCYCLE_CLEARANCE:" + EMPLOYEE)
                .containsEntry("fcaClearanceRef", "doc:FCA_CLEARANCE:" + EMPLOYEE)
                .containsEntry("acceptanceLetterRef", "doc:ACCEPTANCE_OF_RESIGNATION:" + EMPLOYEE)
                .containsEntry("finalSettlementRef", "doc:FINAL_SETTLEMENT_STATEMENT:" + EMPLOYEE);
    }

    @Test
    @DisplayName("both milestones are passed")
    void passesBothMilestones() {
        runsTheResignationToPreservation();

        List<String> milestones = cmmnEngineConfiguration.getCmmnHistoryService()
                .createHistoricMilestoneInstanceQuery()
                .milestoneInstanceCaseInstanceId(caseInstance.getId())
                .list().stream()
                .map(milestone -> milestone.getName())
                .toList();

        assertThat(milestones).containsExactlyInAnyOrder("Resignation accepted", "Employee file closed");
    }

    @Test
    @DisplayName("stage B does not open before SSR has routed both documents")
    void holdsTheDepartmentalClearancesUntilSsrIsDone() {
        complete("aseClearance", Map.of("decision", "approve"));
        approve("rseApproval");
        approve("zsiApproval");
        approve("smApproval");
        approve("gmApproval");
        complete("ssrReceiveDocuments", Map.of("resignationLetterReceived", true, "salesClearanceReceived", true));

        // SIMU and IB are done but Director Marketing has not signed, so SSR is not finished.
        complete("simuClearance", Map.of("duesOutstanding", 0d));
        complete("ibClearance", Map.of("duesOutstanding", 0d));
        assertThat(openTaskKeys())
                .as("SBM cannot start on a clearance SSR has not forwarded")
                .containsExactly("directorMarketingSignature");

        approve("directorMarketingSignature");
        assertThat(openTaskKeys()).containsExactly("issueClearance", "issueClearance", "issueClearance");
    }

    private Task taskFor(String taskDefinitionKey) {
        return cmmnTaskService.createTaskQuery().taskDefinitionKey(taskDefinitionKey).singleResult();
    }

    /** The three clearances share a process, so the candidate group is what tells them apart. */
    private void completeClearance(String candidateGroup, Map<String, Object> variables) {
        Task task = cmmnTaskService.createTaskQuery()
                .taskDefinitionKey("issueClearance")
                .taskCandidateGroup(candidateGroup)
                .singleResult();
        assertThat(task).as("a clearance task for %s", candidateGroup).isNotNull();
        lastClearanceTask = task;
        completeTask(task, variables);
    }
}
