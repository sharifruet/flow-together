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
import static org.assertj.core.api.Assertions.fail;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Holds the checked-in Keycloak realm to the sample identities.
 *
 * <p>The engine and the identity provider are two stores of the same twenty-two people, and
 * nothing reconciles them. Flowable resolves an assignee or a candidate group against its own
 * IDM tables; the browser signs in against Keycloak and sends whatever
 * {@code preferred_username} it got back. If those two names differ by so much as a dot, the
 * sign-in succeeds, the app loads, and the user's inbox is silently empty - which looks like a
 * modelling bug and is not one.
 *
 * <p>So: every sample user must exist in the realm under exactly their engine id, and their
 * realm group memberships must be the ones the engine will use.
 *
 * <p>This reads a file outside the module, which is unusual. The alternative is a realm that
 * drifts from the identities it exists to authenticate, discovered by a person clicking
 * through an empty task list.
 */
class ResignationKeycloakRealmTest {

    private static final String REALM_PATH = "docker/config/keycloak-flowable.json";

    @Test
    @DisplayName("every sample user can sign in, under the id the engine knows them by")
    void everySampleUserIsInTheRealm() {
        Map<String, JsonNode> realmUsers = new LinkedHashMap<>();
        for (JsonNode user : realm().path("users")) {
            realmUsers.put(user.path("username").asText(), user);
        }

        for (JsonNode sample : sampleData().path("users")) {
            String id = sample.path("id").asText();
            assertThat(realmUsers)
                    .as("'%s' exists in the engine but cannot sign in: no Keycloak user with that "
                            + "username. AuthContext maps preferred_username onto the engine id.", id)
                    .containsKey(id);

            JsonNode realmUser = realmUsers.get(id);
            assertThat(realmUser.path("enabled").asBoolean())
                    .as("'%s' is in the realm but disabled", id)
                    .isTrue();
            assertThat(realmUser.path("email").asText())
                    .as("'%s' has a different address in the realm than in the engine", id)
                    .isEqualTo(sample.path("email").asText());
        }
    }

    @Test
    @DisplayName("realm group membership matches the memberships the engine assigns on")
    void groupMembershipsAgree() {
        Map<String, JsonNode> realmUsers = new LinkedHashMap<>();
        for (JsonNode user : realm().path("users")) {
            realmUsers.put(user.path("username").asText(), user);
        }

        for (JsonNode sample : sampleData().path("users")) {
            String id = sample.path("id").asText();
            JsonNode realmUser = realmUsers.get(id);
            if (realmUser == null) {
                continue; // The test above is the one that reports this.
            }

            Set<String> expected = new LinkedHashSet<>();
            for (JsonNode group : sample.path("groups")) {
                expected.add("/" + group.asText());
            }

            Set<String> actual = new LinkedHashSet<>();
            for (JsonNode path : realmUser.path("groups")) {
                actual.add(path.asText());
            }

            assertThat(actual)
                    .as("'%s' is in %s in the engine; the realm puts them in %s", id, expected, actual)
                    .containsAll(expected);
        }
    }

    @Test
    @DisplayName("every position the spreadsheet names is a group in the realm")
    void everySampleGroupIsInTheRealm() {
        Set<String> realmGroups = new LinkedHashSet<>();
        for (JsonNode group : realm().path("groups")) {
            realmGroups.add(group.path("name").asText());
        }

        for (JsonNode group : sampleData().path("groups")) {
            String id = group.path("id").asText();
            assertThat(realmGroups)
                    .as("group '%s' assigns work in the models but is not a group in the realm", id)
                    .contains(id);
        }
    }

    private JsonNode realm() {
        try {
            return new ObjectMapper().readTree(Files.readAllBytes(realmFile()));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * Walks up from the module directory to the checkout root.
     *
     * <p>Surefire runs with the module as the working directory, and the realm belongs to the
     * repository rather than to any module, so there is no classpath answer to this.
     */
    private Path realmFile() {
        for (Path candidate = Path.of("").toAbsolutePath(); candidate != null; candidate = candidate.getParent()) {
            Path realm = candidate.resolve(REALM_PATH);
            if (Files.isRegularFile(realm)) {
                return realm;
            }
        }
        return fail("%s not found in any parent of %s", REALM_PATH, Path.of("").toAbsolutePath());
    }

    private JsonNode sampleData() {
        try (InputStream in = getClass().getClassLoader()
                .getResourceAsStream("identity/resignation-sample-users.json")) {
            return new ObjectMapper().readTree(in);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
