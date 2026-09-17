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
package org.flowable.form.engine.impl.db;

import java.util.Map;

import org.apache.commons.lang3.StringUtils;
import org.flowable.common.engine.impl.db.EngineSchemaManagerLockConfiguration;
import org.flowable.common.engine.impl.db.EngineSqlScriptBasedDbSchemaManager;
import org.flowable.form.engine.FormEngine;
import org.flowable.form.engine.impl.util.CommandContextUtil;

/**
 * Schema management for the form engine, on the same hand-written SQL scripts as the other
 * engines ({@code org/flowable/form/db/{create,drop,upgrade}}).
 *
 * <p>Databases created by the Liquibase-based form engine (Flowable 6.x / 7.0-SNAPSHOT) carry an
 * {@code ACT_FO_DATABASECHANGELOG} table and no {@code form.schema.version} property; the changelog
 * id is mapped to the engine version that introduced it so the SQL upgrade steps can take over.
 */
public class FormDbSchemaManager extends EngineSqlScriptBasedDbSchemaManager {

    protected static final String FORM_DB_SCHEMA_LOCK_NAME = "formDbSchemaLock";

    protected static final Map<String, String> changeLogVersionMap = Map.ofEntries(
            Map.entry("1", "6.0.0.5"),
            Map.entry("2", "6.3.0.0"),
            Map.entry("3", "6.4.0.0"),
            Map.entry("4", "6.4.1.3"),
            Map.entry("5", "6.6.0.0"),
            Map.entry("6", "6.8.0.0")
    );

    public FormDbSchemaManager() {
        super("form", new EngineSchemaManagerLockConfiguration(CommandContextUtil::getFormEngineConfiguration));
    }

    @Override
    protected String getEngineVersion() {
        return FormEngine.VERSION;
    }

    @Override
    protected String getSchemaVersionPropertyName() {
        return "form.schema.version";
    }

    @Override
    protected String getDbSchemaLockName() {
        return FORM_DB_SCHEMA_LOCK_NAME;
    }

    @Override
    protected String getEngineTableName() {
        return "ACT_FO_FORM_DEFINITION";
    }

    @Override
    protected String getChangeLogTableName() {
        return "ACT_FO_DATABASECHANGELOG";
    }

    @Override
    protected String getDbVersionForChangelogVersion(String changeLogVersion) {
        if (StringUtils.isNotEmpty(changeLogVersion) && changeLogVersionMap.containsKey(changeLogVersion)) {
            return changeLogVersionMap.get(changeLogVersion);
        }
        return "5.99.0.0";
    }

    @Override
    protected String getResourcesRootDirectory() {
        return "org/flowable/form/db/";
    }
}
