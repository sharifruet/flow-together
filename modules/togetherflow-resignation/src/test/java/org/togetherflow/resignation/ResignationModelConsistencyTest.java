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

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.flowable.bpmn.converter.BpmnXMLConverter;
import org.flowable.bpmn.model.BpmnModel;
import org.flowable.bpmn.model.ServiceTask;
import org.flowable.bpmn.model.UserTask;
import org.flowable.cmmn.converter.CmmnXmlConverter;
import org.flowable.cmmn.model.CmmnModel;
import org.flowable.cmmn.model.HumanTask;
import org.flowable.cmmn.model.IOParameter;
import org.flowable.cmmn.model.PlanItemDefinition;
import org.flowable.cmmn.model.ProcessTask;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Holds the three sets of names in this module to each other.
 *
 * <p>The models, the forms and the sample identities are separate files that agree only by
 * convention: a {@code candidateGroups} in the CMMN has to name a group in
 * {@code resignation-sample-users.json}, and a {@code formKey} has to name a file in
 * {@code forms/}. Nothing at deploy time notices when one of the three moves and the others do
 * not - the case deploys perfectly happily and then shows nobody a task. This test notices.
 */
class ResignationModelConsistencyTest {

    private static final List<String> PROCESS_RESOURCES = ResignationEngineTest.PROCESS_RESOURCES;
    private static final String CASE_RESOURCE = ResignationEngineTest.CASE_RESOURCE;

    @Test
    @DisplayName("every group a model assigns work to is in the sample identities")
    void everyCandidateGroupHasSampleUsers() {
        Set<String> declared = new LinkedHashSet<>();
        for (JsonNode group : sampleData().path("groups")) {
            declared.add(group.path("id").asText());
        }

        assertThat(candidateGroups())
                .allSatisfy(group -> assertThat(declared)
                        .as("group '%s' is assigned work by a model but has no sample users", group)
                        .contains(group));
    }

    @Test
    @DisplayName("the sample identities carry nobody the models never reach")
    void everySampleGroupIsUsed() {
        Set<String> used = new LinkedHashSet<>(candidateGroups());
        // Being notified counts as being reached - that is all the reception desk ever is.
        used.addAll(notificationRecipients());
        // The case is started by an ASE and is about a member of sales-field. Neither is a
        // candidate group on a task, and both are needed for a demo to have anyone to be.
        used.add(ResignationRoles.ASE);
        used.add(ResignationRoles.SALES_FIELD);

        for (JsonNode group : sampleData().path("groups")) {
            String id = group.path("id").asText();
            assertThat(used).as("sample group '%s' is never referenced by a model", id).contains(id);
        }
    }

    @Test
    @DisplayName("the case passes SBM, GAD and FCA into the shared clearance process")
    void wiresTheThreeDepartmentalClearances() {
        assertThat(processTaskInputs("clearanceGroup"))
                .containsExactlyInAnyOrder(ResignationRoles.SBM, ResignationRoles.GAD, ResignationRoles.FCA);
    }

    @Test
    @DisplayName("every notification recipient is somebody the identity store knows")
    void everyNotificationRecipientIsAGroup() {
        Set<String> declared = new LinkedHashSet<>();
        sampleData().path("groups").forEach(group -> declared.add(group.path("id").asText()));

        Set<String> recipients = notificationRecipients();
        assertThat(recipients).as("the models notify somebody").isNotEmpty();
        assertThat(recipients)
                .allSatisfy(recipient -> assertThat(declared)
                        .as("'%s' is notified by a model but is not a group anyone can be in", recipient)
                        .contains(recipient));
    }

    @Test
    @DisplayName("the group constants and the sample identities are the same list")
    void rolesMatchTheSampleIdentities() {
        List<String> declared = new ArrayList<>();
        sampleData().path("groups").forEach(group -> declared.add(group.path("id").asText()));

        assertThat(ResignationRoles.all()).containsExactlyInAnyOrderElementsOf(declared);
    }

    /**
     * The literal recipient lists in every {@code resignationNotifier.send(...)} expression.
     *
     * <p>Recipients are not {@code candidateGroups}, so nothing else in this test class looks
     * at them, and nothing at deploy time does either - a notification addressed to a group
     * that does not exist deploys, runs and reaches no one. That is exactly how {@code 'acc'}
     * survived as a recipient for a while when the group is called {@code acc-officer}.
     *
     * <p>Recipients given as an expression are skipped: the acceptance letter goes to
     * {@code employeeUserId}, a person the case supplies, and there is nothing static to
     * check that against.
     */
    private Set<String> notificationRecipients() {
        Pattern call = Pattern.compile("resignationNotifier\\.send\\([^)]*,\\s*'([^']*)'\\s*\\)");
        Set<String> recipients = new LinkedHashSet<>();
        List<String> expressions = new ArrayList<>();
        for (String resource : PROCESS_RESOURCES) {
            processModel(resource).getMainProcess().findFlowElementsOfType(ServiceTask.class, true)
                    .forEach(task -> expressions.add(task.getImplementation()));
        }
        for (PlanItemDefinition definition : caseModel().getPrimaryCase().getPlanModel()
                .findPlanItemDefinitionsOfType(org.flowable.cmmn.model.ServiceTask.class, true)) {
            expressions.add(((org.flowable.cmmn.model.ServiceTask) definition).getImplementation());
        }
        for (String expression : expressions) {
            if (expression == null) {
                continue;
            }
            Matcher matcher = call.matcher(expression);
            while (matcher.find()) {
                for (String recipient : matcher.group(1).split(",")) {
                    if (!recipient.isBlank()) {
                        recipients.add(recipient.trim());
                    }
                }
            }
        }
        return recipients;
    }

    @Test
    @DisplayName("every form key a model names has a form to render")
    void everyFormKeyHasAForm() {
        Set<String> shipped = shippedFormKeys();
        assertThat(shipped).as("forms are on the classpath at all").isNotEmpty();

        assertThat(formKeys())
                .allSatisfy(key -> assertThat(shipped)
                        .as("form key '%s' is named by a model but no .form defines it", key)
                        .contains(key));
    }

    @Test
    @DisplayName("no form is shipped that nothing asks for")
    void everyFormIsUsed() {
        Set<String> used = new LinkedHashSet<>(formKeys());

        assertThat(shippedFormKeys())
                .allSatisfy(key -> assertThat(used).as("form '%s' is not named by any model", key).contains(key));
    }

    /** Candidate groups from every user task in the case and the processes, expressions aside. */
    private Set<String> candidateGroups() {
        Set<String> groups = new LinkedHashSet<>();
        for (HumanTask task : caseModel().getPrimaryCase().getPlanModel()
                .findPlanItemDefinitionsOfType(HumanTask.class, true)) {
            addLiterals(groups, task.getCandidateGroups());
        }
        for (String resource : PROCESS_RESOURCES) {
            for (UserTask task : processModel(resource).getMainProcess().findFlowElementsOfType(UserTask.class, true)) {
                addLiterals(groups, task.getCandidateGroups());
            }
        }
        // departmentClearance takes its group from ${clearanceGroup}; the three values the case
        // passes in are as much a model-level assignment as a literal candidateGroups is.
        groups.addAll(processTaskInputs("clearanceGroup"));
        assertThat(groups).as("the models assign work to somebody").isNotEmpty();
        return groups;
    }

    /** Form keys named by the case start form, the case's human tasks and the processes. */
    private Set<String> formKeys() {
        Set<String> keys = new LinkedHashSet<>();
        CmmnModel caseModel = caseModel();
        addLiterals(keys, List.of(caseModel.getPrimaryCase().getPlanModel().getFormKey()));
        for (HumanTask task : caseModel.getPrimaryCase().getPlanModel()
                .findPlanItemDefinitionsOfType(HumanTask.class, true)) {
            addLiterals(keys, List.of(task.getFormKey()));
        }
        for (String resource : PROCESS_RESOURCES) {
            for (UserTask task : processModel(resource).getMainProcess().findFlowElementsOfType(UserTask.class, true)) {
                addLiterals(keys, List.of(task.getFormKey()));
            }
        }
        keys.addAll(processTaskInputs("clearanceFormKey"));
        return keys;
    }

    /**
     * The literal values the case's process tasks pass into a given process variable.
     *
     * <p>This is how the three departmental clearances differ from each other: one process,
     * three process tasks, each supplying a group and a form as a {@code sourceExpression}.
     */
    private Set<String> processTaskInputs(String target) {
        Set<String> values = new LinkedHashSet<>();
        for (ProcessTask task : caseModel().getPrimaryCase().getPlanModel()
                .findPlanItemDefinitionsOfType(ProcessTask.class, true)) {
            for (IOParameter parameter : task.getInParameters()) {
                if (target.equals(parameter.getTarget())) {
                    addLiterals(values, List.of(parameter.getSourceExpression()));
                }
            }
        }
        return values;
    }

    /**
     * Skips anything that is an expression. {@code candidateGroups="${clearanceGroup}"} is
     * resolved at runtime and there is nothing here to check it against - the case passes the
     * three values, and {@link #everySampleGroupIsUsed()} is what keeps them honest.
     */
    private void addLiterals(Set<String> target, List<String> values) {
        if (values == null) {
            return;
        }
        for (String value : values) {
            if (value != null && !value.isBlank() && !value.contains("${")) {
                target.add(value.trim());
            }
        }
    }

    private Set<String> shippedFormKeys() {
        Set<String> keys = new LinkedHashSet<>();
        ObjectMapper mapper = new ObjectMapper();
        try (Stream<Path> forms = Files.list(resourceDirectory("forms"))) {
            forms.filter(path -> path.toString().endsWith(".form")).sorted().forEach(path -> {
                try {
                    keys.add(mapper.readTree(path.toFile()).path("key").asText());
                } catch (IOException e) {
                    throw new UncheckedIOException(e);
                }
            });
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return keys;
    }

    private Path resourceDirectory(String name) {
        try {
            return Path.of(getClass().getClassLoader().getResource(name).toURI());
        } catch (URISyntaxException e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * Both converters validate against the XSD before parsing, and each pass reads the stream
     * from the start, so the provider has to hand out a fresh one every time it is asked.
     * Validating here rather than only at deploy time is deliberate: a malformed diagram is
     * cheaper to find in a parse test than in an engine test.
     */
    private CmmnModel caseModel() {
        return new CmmnXmlConverter().convertToCmmnModel(() -> open(CASE_RESOURCE), true, false);
    }

    private BpmnModel processModel(String resource) {
        return new BpmnXMLConverter().convertToBpmnModel(() -> open(resource), true, false);
    }

    private InputStream open(String resource) {
        InputStream in = getClass().getClassLoader().getResourceAsStream(resource);
        assertThat(in).as("%s is on the classpath", resource).isNotNull();
        return in;
    }

    private JsonNode sampleData() {
        try (InputStream in = open(ResignationSampleIdentity.RESOURCE)) {
            return new ObjectMapper().readTree(in);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
