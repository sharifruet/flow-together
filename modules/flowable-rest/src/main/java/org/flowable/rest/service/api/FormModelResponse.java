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
package org.flowable.rest.service.api;

import java.util.Date;
import java.util.List;

import org.flowable.form.api.FormInfo;
import org.flowable.form.api.FormInstanceInfo;
import org.flowable.form.model.FormField;
import org.flowable.form.model.FormOutcome;
import org.flowable.form.model.SimpleFormModel;

public class FormModelResponse {

    protected String id;
    protected String name;
    protected String description;
    protected String key;
    protected int version;
    protected List<FormField> fields;
    protected List<FormOutcome> outcomes;
    protected String outcomeVariableName;

    // Present only when the model describes a recorded submission (a historic task form).
    protected String formInstanceId;
    protected String submittedBy;
    protected Date submittedDate;
    protected String selectedOutcome;

    public FormModelResponse(FormInfo formInfo) {
        this.id = formInfo.getId();
        this.name = formInfo.getName();
        this.description = formInfo.getDescription();
        this.key = formInfo.getKey();
        this.version = formInfo.getVersion();
        if (formInfo instanceof FormInstanceInfo) {
            FormInstanceInfo instanceInfo = (FormInstanceInfo) formInfo;
            this.formInstanceId = instanceInfo.getFormInstanceId();
            this.submittedBy = instanceInfo.getSubmittedBy();
            this.submittedDate = instanceInfo.getSubmittedDate();
            this.selectedOutcome = instanceInfo.getSelectedOutcome();
        }
    }
    
    public FormModelResponse(FormInfo formInfo, SimpleFormModel formModel) {
        this(formInfo);
        
        this.fields = formModel.getFields();
        this.outcomes = formModel.getOutcomes();
        this.outcomeVariableName = formModel.getOutcomeVariableName();
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
    }

    public int getVersion() {
        return version;
    }

    public void setVersion(int version) {
        this.version = version;
    }

    public List<FormField> getFields() {
        return fields;
    }

    public void setFields(List<FormField> fields) {
        this.fields = fields;
    }

    public List<FormOutcome> getOutcomes() {
        return outcomes;
    }

    public void setOutcomes(List<FormOutcome> outcomes) {
        this.outcomes = outcomes;
    }

    public String getOutcomeVariableName() {
        return outcomeVariableName;
    }

    public void setOutcomeVariableName(String outcomeVariableName) {
        this.outcomeVariableName = outcomeVariableName;
    }
    public String getFormInstanceId() {
        return formInstanceId;
    }

    public void setFormInstanceId(String formInstanceId) {
        this.formInstanceId = formInstanceId;
    }

    public String getSubmittedBy() {
        return submittedBy;
    }

    public void setSubmittedBy(String submittedBy) {
        this.submittedBy = submittedBy;
    }

    public Date getSubmittedDate() {
        return submittedDate;
    }

    public void setSubmittedDate(Date submittedDate) {
        this.submittedDate = submittedDate;
    }

    public String getSelectedOutcome() {
        return selectedOutcome;
    }

    public void setSelectedOutcome(String selectedOutcome) {
        this.selectedOutcome = selectedOutcome;
    }
}
