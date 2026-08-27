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
 * Writes each notification to the log instead of sending it.
 *
 * <p>This is a stand-in, and deliberately a visible one: a demo of the resignation case should
 * show that the notification happened at the right point, not quietly send mail to twenty
 * invented addresses at bpl.net.
 */
public class LoggingResignationNotifier implements ResignationNotifier {

    private static final Logger LOGGER = LoggerFactory.getLogger(LoggingResignationNotifier.class);

    @Override
    public boolean send(String event, String employeeId, String recipients) {
        LOGGER.info("Resignation notification [{}] for employee {} to {}", event, employeeId, recipients);
        return true;
    }
}
