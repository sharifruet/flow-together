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
 * What became of one thing that arrived on an inbound channel.
 *
 * <p>The distinction between {@link #RECEIVED} and {@link #UNRESOLVED} is the whole
 * reason an operator wants this feed. "Nothing happened" has two very different causes —
 * the event never arrived, or it arrived and the registry could not turn it into
 * anything — and without a record the two are indistinguishable from the outside.
 */
public enum EventRecordStatus {

    /** The pipeline resolved the payload to an event, which was then dispatched. */
    RECEIVED,

    /**
     * The payload arrived and the pipeline ran, but produced no event: usually a key
     * detector that found no matching event definition, or a filter that dropped it.
     */
    UNRESOLVED,

    /** The pipeline threw. The payload arrived and was rejected before dispatch. */
    FAILED
}
