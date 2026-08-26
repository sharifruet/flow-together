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
package org.togetherflow.events.recorder;

/**
 * How {@code GET /event-recorder/events} decides which rows a caller may see.
 *
 * <p>There is no third value meaning "work it out". The endpoint returns event payloads,
 * so the deployment states its intent and the wrong answer is not reachable by leaving a
 * property unset.
 */
public enum EventRecorderTenantScope {

    /**
     * The default. Rows are filtered to {@link EventRecorderTenantResolver#currentTenantId()},
     * and a {@code tenantId} parameter that disagrees with it is refused. Enabling the
     * recorder without supplying a resolver fails startup — which is the point: an
     * operator who does not read the documentation cannot end up serving every tenant's
     * payloads to every caller.
     */
    STRICT,

    /**
     * Every caller may read every row, and {@code tenantId} is an ordinary filter.
     *
     * <p>Correct for a single-tenant deployment, and a data leak in any other. Only ever
     * reached by an operator writing it down.
     */
    SINGLE_TENANT
}
