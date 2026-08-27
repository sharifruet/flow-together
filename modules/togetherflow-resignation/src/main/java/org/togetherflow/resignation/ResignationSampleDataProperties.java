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

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Whether to put the sample people in the identity store, and what password to give them.
 *
 * <p>Off by default. Adding this jar to an application deploys the models - they are picked up
 * by Flowable's own autodeployment - but writing twenty invented users into that application's
 * directory is a different kind of act, and it is one somebody has to ask for.
 */
@ConfigurationProperties(prefix = "togetherflow.resignation.sample-users")
public class ResignationSampleDataProperties {

    /** Create the sample groups, users and memberships on startup if they are not there. */
    private boolean enabled = false;

    /**
     * The password every sample user gets.
     *
     * <p>One value for all twenty, and a weak one: these accounts exist so a demo has somebody
     * to sign in as. If that is not what they are for in your deployment, this property is the
     * wrong tool and {@code enabled} should stay false.
     */
    private String password = "demo";

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }
}
