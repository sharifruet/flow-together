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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;

import org.flowable.common.engine.api.FlowableException;
import org.flowable.common.engine.api.delegate.event.FlowableEngineEventType;
import org.flowable.common.engine.api.delegate.event.FlowableEntityEvent;
import org.flowable.common.engine.api.delegate.event.FlowableEvent;
import org.flowable.common.engine.api.delegate.event.FlowableEventType;
import org.flowable.common.engine.impl.persistence.entity.ByteArrayEntityImpl;
import org.flowable.engine.impl.persistence.entity.AttachmentEntityImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import com.sun.net.httpserver.HttpServer;

/**
 * The publisher posts the attachment bytes to the gateway and records the URL the
 * gateway returns, which is the SharePoint item.
 */
class SharePointAttachmentPublisherTest {

    private HttpServer server;

    @AfterEach
    void stop() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void publishesANewAttachmentAndStoresTheSharePointUrl() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/attachments", exchange -> {
            calls.incrementAndGet();
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            assertThat(body).contains("name=\"taskId\"");
            assertThat(body).contains("task-9");
            assertThat(body).contains("name=\"processInstanceId\"");
            assertThat(body).contains("proc-4");
            assertThat(body).contains("hello-from-task");
            byte[] json = "{\"url\":\"http://localhost:8091/sharepoint/items/abc\",\"fileName\":\"note.txt\"}"
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, json.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(json);
            }
        });
        server.start();

        AttachmentEntityImpl attachment = attachment();
        publisher(true).onEvent(created(attachment));

        assertThat(calls).hasValue(1);
        assertThat(attachment.getUrl()).isEqualTo("http://localhost:8091/sharepoint/items/abc");
    }

    @Test
    void leavesALinkAttachmentWhereItAlreadyPoints() {
        AttachmentEntityImpl attachment = attachment();
        attachment.setUrl("https://contoso.sharepoint.com/already");

        publisher(true).onEvent(created(attachment));

        assertThat(attachment.getUrl()).isEqualTo("https://contoso.sharepoint.com/already");
    }

    @Test
    void failsTheAttachmentWhenSharePointRejectsIt() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/attachments", exchange -> {
            byte[] json = "Attachment storage is unavailable.".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(502, json.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(json);
            }
        });
        server.start();

        AttachmentEntityImpl attachment = attachment();
        assertThatThrownBy(() -> publisher(true).onEvent(created(attachment)))
                .isInstanceOf(FlowableException.class)
                .hasMessageContaining("502");
        assertThat(attachment.getUrl()).isNull();
    }

    @Test
    void readsTheUrlFieldTheGatewayReturns() {
        assertThat(SharePointAttachmentPublisher.urlFrom(
                "{\"url\":\"http://localhost:8091/sharepoint/items/abc\",\"fileName\":\"n\"}"))
                .isEqualTo("http://localhost:8091/sharepoint/items/abc");
    }

    private SharePointAttachmentPublisher publisher(boolean required) {
        int port = server == null ? 9 : server.getAddress().getPort();
        return new SharePointAttachmentPublisher("http://127.0.0.1:" + port, required);
    }

    private static AttachmentEntityImpl attachment() {
        AttachmentEntityImpl attachment = new AttachmentEntityImpl();
        attachment.setName("note.txt");
        attachment.setType("text/plain");
        attachment.setTaskId("task-9");
        attachment.setProcessInstanceId("proc-4");
        ByteArrayEntityImpl content = new ByteArrayEntityImpl();
        content.setBytes("hello-from-task".getBytes(StandardCharsets.UTF_8));
        attachment.setContent(content);
        return attachment;
    }

    private static FlowableEvent created(AttachmentEntityImpl attachment) {
        return new FlowableEntityEvent() {
            @Override
            public FlowableEventType getType() {
                return FlowableEngineEventType.ENTITY_CREATED;
            }

            @Override
            public Object getEntity() {
                return attachment;
            }
        };
    }

}
