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
 * Answers "which tenant is asking?" for the inbound event log.
 *
 * <p>This module cannot answer that itself. It has no Spring Security dependency and no
 * opinion about how the host application authenticates — it is mounted inside somebody
 * else's app and inherits whatever that app already enforces. So the host supplies this,
 * usually as a few lines over its own principal:
 *
 * <pre>
 * &#64;Bean
 * EventRecorderTenantResolver tenantResolver() {
 *     return () -&gt; ((MyPrincipal) SecurityContextHolder.getContext()
 *             .getAuthentication().getPrincipal()).getTenantId();
 * }
 * </pre>
 *
 * <p><strong>Returning {@code null} does not mean "no restriction".</strong> It means the
 * caller's tenant could not be determined, and the request is refused. A resolver that
 * quietly fails must not hand back every tenant's rows — that is the exact defect this
 * interface exists to close. A deployment that genuinely wants unfiltered reads says so
 * with {@code togetherflow.events.recorder.tenant-scope=single-tenant} instead, which is
 * a statement an operator has to make on purpose.
 */
@FunctionalInterface
public interface EventRecorderTenantResolver {

    /**
     * The tenant whose rows the current caller may read.
     *
     * @return the tenant id, or {@code null} if it cannot be determined — which refuses
     *         the request rather than widening it
     */
    String currentTenantId();
}
