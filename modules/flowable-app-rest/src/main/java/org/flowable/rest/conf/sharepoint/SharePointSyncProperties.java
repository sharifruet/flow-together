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
package org.flowable.rest.conf.sharepoint;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Publishes task files to {@code togetherflow-attachment-gateway}.
 *
 * <p>Off unless explicitly enabled. The gateway is a separate process; starting Flowable
 * without it must not turn every attachment upload into a connection error.
 */
@ConfigurationProperties(prefix = "togetherflow.attachments.sharepoint")
public class SharePointSyncProperties {

    private boolean enabled;

    /** Base URL of the attachment gateway, for example {@code http://localhost:8091}. */
    private String gatewayUrl = "http://localhost:8091";

    /**
     * When true, an attachment is not saved if SharePoint rejects it. That is what makes
     * "the file is in SharePoint" something a test can rely on.
     */
    private boolean required = true;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getGatewayUrl() {
        return gatewayUrl;
    }

    public void setGatewayUrl(String gatewayUrl) {
        this.gatewayUrl = gatewayUrl;
    }

    public boolean isRequired() {
        return required;
    }

    public void setRequired(boolean required) {
        this.required = required;
    }
}
