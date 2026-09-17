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
package org.flowable.form.rest.conf.engine;

import javax.sql.DataSource;

import org.flowable.common.engine.impl.AbstractEngineConfiguration;
import org.flowable.form.api.FormService;
import org.flowable.form.api.FormRepositoryService;
import org.flowable.form.engine.FormEngine;
import org.flowable.form.engine.FormEngineConfiguration;
import org.flowable.form.engine.impl.cfg.StandaloneInMemFormEngineConfiguration;
import org.flowable.form.spring.FormEngineFactoryBean;
import org.flowable.form.spring.SpringFormEngineConfiguration;
import org.flowable.idm.spring.configurator.SpringIdmEngineConfigurator;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;

import com.zaxxer.hikari.HikariDataSource;

/**
 * @author Yvo Swillens
 */
@Configuration(proxyBeanMethods = false)
public class FlowableFormEngineConfiguration {

    @Value("${jdbc.url:jdbc:h2:mem:flowable;DB_CLOSE_DELAY=1000}")
    protected String jdbcUrl;

    @Value("${jdbc.driver:org.h2.Driver}")
    protected String jdbcDriver;

    @Value("${jdbc.username:sa}")
    protected String jdbcUsername;

    @Value("${jdbc.password:}")
    protected String jdbcPassword;

    @Bean
    public DataSource dataSource() {
        HikariDataSource dataSource = new HikariDataSource();
        dataSource.setMinimumIdle(0);
        dataSource.setJdbcUrl(jdbcUrl);
        dataSource.setDriverClassName(jdbcDriver);
        dataSource.setUsername(jdbcUsername);
        dataSource.setPassword(jdbcPassword);
        return dataSource;
    }

    @Bean(name = "transactionManager")
    public PlatformTransactionManager annotationDrivenTransactionManager(DataSource dataSource) {
        DataSourceTransactionManager transactionManager = new DataSourceTransactionManager();
        transactionManager.setDataSource(dataSource);
        return transactionManager;
    }

    @Bean(name = "formEngine")
    public FormEngineFactoryBean formEngineFactoryBean(FormEngineConfiguration formEngineConfiguration) {
        FormEngineFactoryBean factoryBean = new FormEngineFactoryBean();
        factoryBean.setFormEngineConfiguration(formEngineConfiguration);
        return factoryBean;
    }

    @Bean(name = "formEngineConfiguration")
    public FormEngineConfiguration formEngineConfiguration(DataSource dataSource, PlatformTransactionManager transactionManager,
            SpringIdmEngineConfigurator springIdmEngineConfigurator) {
        SpringFormEngineConfiguration formEngineConfiguration = new SpringFormEngineConfiguration();
        formEngineConfiguration.setDataSource(dataSource);
        formEngineConfiguration.setDatabaseSchemaUpdate(FormEngineConfiguration.DB_SCHEMA_UPDATE_TRUE);
        formEngineConfiguration.setTransactionManager(transactionManager);
        formEngineConfiguration.setIdmEngineConfigurator(springIdmEngineConfigurator);
        return formEngineConfiguration;
    }

    @Bean(name = "springIdmEngineConfigurator")
    public SpringIdmEngineConfigurator springIdmEngineConfigurator() {
        return new SpringIdmEngineConfigurator();
    }

    @Bean
    public FormRepositoryService formRepositoryService(FormEngine formEngine) {
        return formEngine.getFormRepositoryService();
    }

    @Bean
    public FormService formService(FormEngine formEngine) {
        return formEngine.getFormService();
    }
}
