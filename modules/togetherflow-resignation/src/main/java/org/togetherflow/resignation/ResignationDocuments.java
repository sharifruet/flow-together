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

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Produces the reference under which a generated document is filed.
 *
 * <p>Three of the seven documents in Resignation_Process.xlsx are produced by the system rather
 * than by a person - the acceptance of resignation (step 1.5, "system will generate Acceptance
 * of resignation"), each departmental clearance, and the final settlement statement. The models
 * call {@link #register} at those points and keep what comes back in a case variable, so the
 * case file names all seven documents even though this build renders none of them.
 *
 * <p>The reference is derived from its inputs and nothing else, so registering the same document
 * twice - which a returned-and-resubmitted approval will do - yields the same reference rather
 * than a second copy.
 */
public class ResignationDocuments {

    private static final Logger LOGGER = LoggerFactory.getLogger(ResignationDocuments.class);

    /**
     * @param documentType e.g. {@code ACCEPTANCE_OF_RESIGNATION}, {@code SBM_CLEARANCE}
     * @param employeeId   the resigning employee
     * @return the reference to store in the case file
     */
    public String register(String documentType, String employeeId) {
        String reference = "doc:" + documentType + ":" + employeeId;
        LOGGER.info("Registered resignation document {}", reference);
        return reference;
    }
}
