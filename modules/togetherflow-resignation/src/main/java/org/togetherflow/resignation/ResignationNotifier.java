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

/**
 * The one outbound side effect the resignation models have.
 *
 * <p>Resignation_Process.xlsx is full of mail: logging the resignation "will generate an email
 * to HRM, ACC and others immediately", the RSE entry "generates notification mail to
 * recipients", the acceptance letter is "sent to recipients using email, shared link". Every
 * one of those is a service task calling {@link #send}, so the models say <em>that</em> a
 * notification goes out and to whom, and say nothing about how.
 *
 * <p>{@link LoggingResignationNotifier} is the default and only logs. Sending real mail means
 * replacing the {@code resignationNotifier} bean; nothing in the models changes.
 */
public interface ResignationNotifier {

    /**
     * @param event      what happened, e.g. {@code RESIGNATION_LOGGED}
     * @param employeeId the resigning employee the notification is about
     * @param recipients comma-separated group ids, or a single user id where the sheet names a
     *                   person rather than a desk - the acceptance letter to the employee is
     *                   the only such case
     * @return {@code true}, so the call reads as a value in an expression service task
     */
    boolean send(String event, String employeeId, String recipients);
}
