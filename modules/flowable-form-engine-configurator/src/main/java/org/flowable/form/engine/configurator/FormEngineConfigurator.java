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
package org.flowable.form.engine.configurator;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

import org.flowable.common.engine.api.FlowableException;
import org.flowable.common.engine.impl.AbstractEngineConfiguration;
import org.flowable.common.engine.impl.AbstractEngineConfigurator;
import org.flowable.common.engine.impl.EngineConfigurator;
import org.flowable.common.engine.impl.EngineDeployer;
import org.flowable.common.engine.impl.interceptor.EngineConfigurationConstants;
import org.flowable.common.engine.impl.persistence.entity.Entity;
import org.flowable.form.engine.FormEngine;
import org.flowable.form.engine.FormEngineConfiguration;
import org.flowable.form.engine.deployer.FormDeployer;
import org.flowable.form.engine.impl.cfg.StandaloneFormEngineConfiguration;
import org.flowable.form.engine.impl.db.EntityDependencyOrder;

/**
 * @author Tijs Rademakers
 * @author Joram Barrez
 */
public class FormEngineConfigurator extends AbstractEngineConfigurator<FormEngine> {

    protected FormEngineConfiguration formEngineConfiguration;

    @Override
    public int getPriority() {
        return EngineConfigurationConstants.PRIORITY_ENGINE_FORM;
    }

    @Override
    protected List<EngineDeployer> getCustomDeployers() {
        List<EngineDeployer> deployers = new ArrayList<>();
        deployers.add(new FormDeployer());
        return deployers;
    }

    @Override
    protected String getMybatisCfgPath() {
        return FormEngineConfiguration.DEFAULT_MYBATIS_MAPPING_FILE;
    }

    /**
     * The base class registers the deployer on the engine this configurator is attached to. A
     * {@code .form} inside a process, case or app deployment must also reach the form engine when
     * that deployment is handled by a <em>sibling</em> engine (FORM_REQUIREMENTS.md FR-D.4), so the
     * deployer is handed to every other engine configuration reachable through the configurators
     * on the same root — before those engines build, which is when they read their custom deployers.
     *
     * <p>The sibling configurators are found by the getter they expose rather than by class, so
     * this module links against none of them; a configurator with no such getter is simply skipped.
     */
    @Override
    public void beforeInit(AbstractEngineConfiguration engineConfiguration) {
        super.beforeInit(engineConfiguration);
        registerDeployerOnSiblingEngines(engineConfiguration);
    }

    protected void registerDeployerOnSiblingEngines(AbstractEngineConfiguration engineConfiguration) {
        List<EngineConfigurator> configurators = engineConfiguration.getAllConfigurators();
        if (configurators == null) {
            configurators = engineConfiguration.getConfigurators();
        }
        if (configurators == null) {
            return;
        }
        for (EngineConfigurator configurator : configurators) {
            if (configurator == this) {
                continue;
            }
            for (String getter : SIBLING_ENGINE_CONFIGURATION_GETTERS) {
                AbstractEngineConfiguration sibling = siblingEngineConfiguration(configurator, getter);
                if (sibling != null && sibling != engineConfiguration) {
                    addFormDeployer(sibling);
                }
            }
        }
    }

    protected static final String[] SIBLING_ENGINE_CONFIGURATION_GETTERS = {
            "getProcessEngineConfiguration", "getCmmnEngineConfiguration", "getAppEngineConfiguration"
    };

    protected AbstractEngineConfiguration siblingEngineConfiguration(EngineConfigurator configurator, String getter) {
        try {
            Method method = configurator.getClass().getMethod(getter);
            Object value = method.invoke(configurator);
            return value instanceof AbstractEngineConfiguration ? (AbstractEngineConfiguration) value : null;
        } catch (NoSuchMethodException e) {
            return null;
        } catch (ReflectiveOperationException e) {
            throw new FlowableException("Could not read " + getter + " from " + configurator.getClass().getName(), e);
        }
    }

    protected void addFormDeployer(AbstractEngineConfiguration engineConfiguration) {
        List<EngineDeployer> deployers = engineConfiguration.getCustomPostDeployers();
        if (deployers == null) {
            deployers = new ArrayList<>();
            engineConfiguration.setCustomPostDeployers(deployers);
        }
        for (EngineDeployer deployer : deployers) {
            if (deployer instanceof FormDeployer) {
                return;
            }
        }
        deployers.add(new FormDeployer());
    }

    @Override
    public void configure(AbstractEngineConfiguration engineConfiguration) {
        if (formEngineConfiguration == null) {
            formEngineConfiguration = new StandaloneFormEngineConfiguration();
        }

        initialiseCommonProperties(engineConfiguration, formEngineConfiguration);

        initEngine();

        initServiceConfigurations(engineConfiguration, formEngineConfiguration);
    }

    @Override
    protected List<Class<? extends Entity>> getEntityInsertionOrder() {
        return EntityDependencyOrder.INSERT_ORDER;
    }

    @Override
    protected List<Class<? extends Entity>> getEntityDeletionOrder() {
        return EntityDependencyOrder.DELETE_ORDER;
    }

    @Override
    protected FormEngine buildEngine() {
        if (formEngineConfiguration == null) {
            throw new FlowableException("FormEngineConfiguration is required");
        }

        return formEngineConfiguration.buildFormEngine();
    }

    public FormEngineConfiguration getFormEngineConfiguration() {
        return formEngineConfiguration;
    }

    public FormEngineConfigurator setFormEngineConfiguration(FormEngineConfiguration formEngineConfiguration) {
        this.formEngineConfiguration = formEngineConfiguration;
        return this;
    }

}
