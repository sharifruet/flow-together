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

import java.util.ArrayList;
import java.util.List;

import org.flowable.common.engine.api.delegate.event.FlowableEventListener;
import org.flowable.spring.SpringProcessEngineConfiguration;
import org.flowable.spring.boot.EngineConfigurationConfigurer;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Wires {@link SharePointAttachmentPublisher} into the process engine when SharePoint
 * sync is switched on.
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(SharePointSyncProperties.class)
@ConditionalOnProperty(prefix = "togetherflow.attachments.sharepoint", name = "enabled", havingValue = "true")
public class SharePointSyncConfiguration {

    @Bean
    public SharePointAttachmentPublisher sharePointAttachmentPublisher(SharePointSyncProperties properties) {
        if (properties.getGatewayUrl() == null || properties.getGatewayUrl().isBlank()) {
            throw new IllegalStateException(
                    "togetherflow.attachments.sharepoint.gateway-url is required when SharePoint sync is enabled.");
        }
        return new SharePointAttachmentPublisher(properties.getGatewayUrl(), properties.isRequired());
    }

    @Bean
    public EngineConfigurationConfigurer<SpringProcessEngineConfiguration> sharePointEngineConfigurer(
            SharePointAttachmentPublisher publisher) {
        return configuration -> {
            List<FlowableEventListener> listeners = configuration.getEventListeners();
            if (listeners == null) {
                listeners = new ArrayList<>();
                configuration.setEventListeners(listeners);
            }
            if (!listeners.contains(publisher)) {
                listeners.add(publisher);
            }
        };
    }
}
