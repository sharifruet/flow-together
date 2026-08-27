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

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

import org.flowable.engine.IdentityService;
import org.flowable.idm.api.Group;
import org.flowable.idm.api.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Creates the sample people the resignation case needs someone to be.
 *
 * <p>The models hand work to seventeen groups. An engine with an empty identity table will run
 * the case perfectly well and show nobody a single task, which makes it look broken, so this
 * reads {@code identity/resignation-sample-users.json} and creates what is missing.
 *
 * <p>Two rules, both because this writes into a store it does not own:
 *
 * <ul>
 *   <li><b>It never overwrites.</b> A user or group that already exists is left exactly as it
 *       is, including its password. Re-running is therefore safe, and a real {@code hrm} group
 *       that happens to share an id with a sample one is not quietly redefined.</li>
 *   <li><b>It is off unless asked.</b> See {@link ResignationSampleDataProperties}; adding this
 *       jar to an application does not by itself put twenty invented people in its directory.</li>
 * </ul>
 */
public class ResignationSampleIdentity {

    private static final Logger LOGGER = LoggerFactory.getLogger(ResignationSampleIdentity.class);

    /** Where the sample data lives on the classpath. */
    public static final String RESOURCE = "identity/resignation-sample-users.json";

    private final IdentityService identityService;
    private final String password;

    public ResignationSampleIdentity(IdentityService identityService, String password) {
        this.identityService = identityService;
        this.password = password;
    }

    /**
     * Creates every group, user and membership in the sample data that is not there already.
     *
     * @return what was created, for logging and for tests to assert on
     */
    public Result apply() {
        JsonNode data = read();
        Result result = new Result();

        for (JsonNode group : data.path("groups")) {
            String id = group.path("id").asText();
            if (identityService.createGroupQuery().groupId(id).count() > 0) {
                continue;
            }
            Group created = identityService.newGroup(id);
            created.setName(group.path("name").asText());
            created.setType(group.path("type").asText("assignment"));
            identityService.saveGroup(created);
            result.groups.add(id);
        }

        for (JsonNode user : data.path("users")) {
            String id = user.path("id").asText();
            if (identityService.createUserQuery().userId(id).count() == 0) {
                User created = identityService.newUser(id);
                created.setFirstName(user.path("firstName").asText());
                created.setLastName(user.path("lastName").asText());
                created.setEmail(user.path("email").asText());
                created.setPassword(password);
                identityService.saveUser(created);
                result.users.add(id);
            }
            for (JsonNode membership : user.path("groups")) {
                String groupId = membership.asText();
                if (identityService.createUserQuery().userId(id).memberOfGroup(groupId).count() == 0) {
                    identityService.createMembership(id, groupId);
                    result.memberships.add(id + "@" + groupId);
                }
            }
        }

        LOGGER.info("Resignation sample identities: created {} groups, {} users, {} memberships",
                result.groups.size(), result.users.size(), result.memberships.size());
        return result;
    }

    protected JsonNode read() {
        ClassLoader classLoader = ResignationSampleIdentity.class.getClassLoader();
        try (InputStream in = classLoader.getResourceAsStream(RESOURCE)) {
            if (in == null) {
                throw new IllegalStateException(RESOURCE + " is not on the classpath");
            }
            return new ObjectMapper().readTree(in);
        } catch (IOException e) {
            throw new IllegalStateException("Could not read " + RESOURCE, e);
        }
    }

    /** What {@link #apply()} created. Empty on a second run, which is the point. */
    public static class Result {

        private final List<String> groups = new ArrayList<>();
        private final List<String> users = new ArrayList<>();
        private final List<String> memberships = new ArrayList<>();

        public List<String> getGroups() {
            return groups;
        }

        public List<String> getUsers() {
            return users;
        }

        /** Each entry is {@code userId@groupId}. */
        public List<String> getMemberships() {
            return memberships;
        }
    }
}
