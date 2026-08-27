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

import org.flowable.idm.api.User;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The sample people, against the engine's own identity store.
 *
 * <p>Two of these matter more than the counting: the seeder has to be safe to run twice, and it
 * has to leave an identity that already exists alone. An application restarts, and the group
 * ids here - {@code hrm}, {@code sbm} - are plausible enough that a real deployment might have
 * its own.
 */
class ResignationSampleIdentityTest extends ResignationEngineTest {

    @Test
    @DisplayName("creates every group, user and membership the models need")
    void seedsTheSampleIdentities() {
        ResignationSampleIdentity.Result result = seed();

        assertThat(result.getGroups()).containsExactlyInAnyOrderElementsOf(ResignationRoles.all());
        assertThat(result.getUsers()).hasSize(22)
                .contains("imran.kabir", "shirin.akhter", "rezaul.karim", "reception.desk");

        assertThat(identityService.createUserQuery().memberOfGroup(ResignationRoles.ACC_OFFICER).list())
                .as("two ACC officers, so claiming the settlement draft is a real choice")
                .hasSize(2);

        assertThat(identityService.createUserQuery().memberOfGroup(ResignationRoles.HRM).list())
                .as("both HRM users, so 'HRM (ISJ)' has somebody to be")
                .extracting(User::getId)
                .containsExactlyInAnyOrder("shirin.akhter", "ismail.jamil");

        for (String group : ResignationRoles.all()) {
            assertThat(identityService.createUserQuery().memberOfGroup(group).count())
                    .as("group '%s' has at least one member", group)
                    .isPositive();
        }
    }

    @Test
    @DisplayName("running it twice creates nothing the second time")
    void isIdempotent() {
        seed();
        ResignationSampleIdentity.Result second = seed();

        assertThat(second.getGroups()).isEmpty();
        assertThat(second.getUsers()).isEmpty();
        assertThat(second.getMemberships()).isEmpty();
    }

    @Test
    @DisplayName("an identity that already exists is left exactly as it was")
    void neverOverwritesAnExistingIdentity() {
        User existing = identityService.newUser("shirin.akhter");
        existing.setFirstName("Someone");
        existing.setLastName("Else");
        existing.setEmail("someone.else@example.org");
        existing.setPassword("a-real-password");
        identityService.saveUser(existing);

        ResignationSampleIdentity.Result result = seed();

        assertThat(result.getUsers()).doesNotContain("shirin.akhter");
        User after = identityService.createUserQuery().userId("shirin.akhter").singleResult();
        assertThat(after.getFirstName()).isEqualTo("Someone");
        assertThat(after.getEmail()).isEqualTo("someone.else@example.org");

        assertThat(result.getMemberships())
                .as("the membership is still added, so the existing user picks up the sample work")
                .contains("shirin.akhter@" + ResignationRoles.HRM);
    }

    @Test
    @DisplayName("the seeded users can be found by the queries the models' assignment rules use")
    void seedsUsersTheCaseCanAssignTo() {
        deployModels();
        seed();

        assertThat(identityService.createUserQuery().memberOfGroup(ResignationRoles.ASE).list())
                .extracting(User::getId)
                .as("somebody can start the case")
                .containsExactly("imran.kabir");
    }

    private ResignationSampleIdentity.Result seed() {
        return new ResignationSampleIdentity(identityService, "demo").apply();
    }
}
