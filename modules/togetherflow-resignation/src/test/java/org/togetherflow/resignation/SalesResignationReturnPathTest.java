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

import java.util.Map;

import org.flowable.common.engine.api.scope.ScopeTypes;
import org.flowable.common.engine.impl.identity.Authentication;
import org.flowable.task.api.Task;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The path the spreadsheet does not describe: an approver who does not approve.
 *
 * <p>Four approvals in a row with no way back would be unusable, so every level in the sales
 * chain can return the record to the ASE. Two things have to hold for that to be safe, and
 * both are checked here: returning really does restart the chain at the RSE, and a task
 * completed with no decision at all returns rather than being read as an approval.
 */
class SalesResignationReturnPathTest extends ResignationEngineTest {

    private static final String ASE = "imran.kabir";

    @BeforeEach
    void startResignation() {
        deployModels();
        Authentication.setAuthenticatedUserId(ASE);
        cmmnRuntimeService.createCaseInstanceBuilder()
                .caseDefinitionKey("salesResignation")
                .variables(Map.of("employeeId", "MPE-10428", "employeeName", "Rakib Hasan"))
                .start();
        complete("aseClearance", Map.of("decision", "approve"));
    }

    @AfterEach
    void clearAuthentication() {
        Authentication.setAuthenticatedUserId(null);
    }

    @Test
    @DisplayName("a return from the ZSI goes back to the ASE and restarts the chain at the RSE")
    void returnsToTheAseAndRestartsTheChain() {
        approve("rseApproval");
        complete("zsiApproval", Map.of("decision", "return", "approvalComment", "Collection figure does not match mSales"));

        assertThat(openTaskKeys()).containsExactly("aseAmendRecord");
        assertThat(cmmnTaskService.createTaskQuery().taskDefinitionKey("aseAmendRecord").singleResult().getAssignee())
                .as("the record goes back to the ASE who logged it, not to a queue")
                .isEqualTo(ASE);

        complete("aseAmendRecord");
        assertThat(openTaskKeys()).containsExactly("rseApproval");

        approve("rseApproval");
        approve("zsiApproval");
        approve("smApproval");
        approve("gmApproval");
        assertThat(openTaskKeys()).containsExactly("ssrReceiveDocuments");
    }

    @Test
    @DisplayName("a returned final settlement goes back to the officer who drafted it")
    void returnsTheSettlementToTheOfficerWhoDraftedIt() {
        walkToTheFinalSettlement();

        // Two ACC officers could pick this up; the one who does becomes the requester.
        claim("prepareFinalSettlement", "pritam.saha");
        complete("prepareFinalSettlement", Map.of("salaryDue", 48500d, "netPayable", 61200d));

        claim("accManagerApproval", "habibur.rahman");
        complete("accManagerApproval", Map.of("decision", "return", "signatureRemarks", "Gratuity is short by one year"));

        assertThat(taskFor("prepareFinalSettlement").getAssignee())
                .as("back to the person who drafted it, not to the ACC queue")
                .isEqualTo("pritam.saha");

        // And again from the director, two steps further on.
        complete("prepareFinalSettlement", Map.of("netPayable", 63400d));
        approve("accManagerApproval");
        complete("accDirectorApproval", Map.of("decision", "return"));
        assertThat(taskFor("prepareFinalSettlement").getAssignee()).isEqualTo("pritam.saha");
    }

    @Test
    @DisplayName("the first draft is a queue item, since nobody has requested anything yet")
    void leavesTheFirstDraftUnassigned() {
        walkToTheFinalSettlement();

        assertThat(taskFor("prepareFinalSettlement").getAssignee())
                .as("no requester yet: getOrDefault yields null and the candidate group carries it")
                .isNull();
        assertThat(cmmnTaskService.createTaskQuery()
                .taskDefinitionKey("prepareFinalSettlement")
                .taskCandidateGroup(ResignationRoles.ACC_OFFICER)
                .count())
                .isEqualTo(1);
    }

    @Test
    @DisplayName("a returned acceptance letter goes back to the HRM officer who sent it for signature")
    void returnsTheAcceptanceLetterToTheHrmOfficerWhoSentIt() {
        walkToTheHrCheck();

        claim("hrmVerifyDocuments", "ismail.jamil");
        complete("hrmVerifyDocuments", Map.of("hasResignationLetter", true));

        complete("headOfHrSignature", Map.of("decision", "return", "signatureRemarks", "Last working day is wrong"));

        assertThat(taskFor("reviseAcceptanceLetter").getAssignee())
                .as("back to the officer who asked for the signature")
                .isEqualTo("ismail.jamil");

        complete("reviseAcceptanceLetter");
        assertThat(openTaskKeys()).containsExactly("headOfHrSignature");
    }

    @Test
    @DisplayName("an unclaimed document check leaves the revision with the HRM group")
    void fallsBackToTheHrmGroupWhenNobodyClaimedTheCheck() {
        walkToTheHrCheck();

        complete("hrmVerifyDocuments", Map.of("hasResignationLetter", true));
        complete("headOfHrSignature", Map.of("decision", "return"));

        assertThat(taskFor("reviseAcceptanceLetter").getAssignee()).isNull();
        assertThat(cmmnTaskService.createTaskQuery()
                .taskDefinitionKey("reviseAcceptanceLetter")
                .taskCandidateGroup(ResignationRoles.HRM)
                .count())
                .as("nobody claimed the check, so the queue is the fallback")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("a task completed without a decision returns rather than approving")
    void treatsAMissingDecisionAsAReturn() {
        complete("rseApproval");

        assertThat(openTaskKeys())
                .as("silence is not consent: no decision variable takes the default flow")
                .containsExactly("aseAmendRecord");
    }

    /** Everything up to and including the departmental clearances. */
    private void walkToTheHrCheck() {
        approve("rseApproval");
        approve("zsiApproval");
        approve("smApproval");
        approve("gmApproval");
        complete("ssrReceiveDocuments");
        approve("directorMarketingSignature");
        complete("simuClearance");
        complete("ibClearance");
        for (Task clearance : cmmnTaskService.createTaskQuery().taskDefinitionKey("issueClearance").list()) {
            completeTask(clearance, Map.of());
        }
    }

    private void walkToTheFinalSettlement() {
        walkToTheHrCheck();
        complete("hrmVerifyDocuments", Map.of("hasResignationLetter", true));
        approve("headOfHrSignature");
        complete("updateClearanceStatusRecord", Map.of("clearanceStatus", "Cleared"));
    }

    private Task taskFor(String taskDefinitionKey) {
        return cmmnTaskService.createTaskQuery().taskDefinitionKey(taskDefinitionKey).singleResult();
    }

    private void claim(String taskDefinitionKey, String userId) {
        Task task = taskFor(taskDefinitionKey);
        if (ScopeTypes.CMMN.equals(task.getScopeType())) {
            cmmnTaskService.claim(task.getId(), userId);
        } else {
            taskService.claim(task.getId(), userId);
        }
    }
}
