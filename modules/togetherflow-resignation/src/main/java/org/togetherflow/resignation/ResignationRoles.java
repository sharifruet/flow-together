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

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * The group ids the resignation models assign work to.
 *
 * <p>These strings are written out in full in the CMMN and BPMN, because a model that reads
 * {@code candidateGroups="sales-rse"} is one a business user can check against the spreadsheet
 * and a model that reads {@code candidateGroups="${ROLE_RSE}"} is not. They are repeated here
 * so Java code - the sample identity seeder, and tests - has one place to fail when a model is
 * renamed rather than twenty string literals that quietly stop matching.
 */
public final class ResignationRoles {

    /** MPE / Sr. MPE. Resigns; has no task of their own, since the ASE logs it for them. */
    public static final String SALES_FIELD = "sales-field";

    /** Area Sales Executive - the supervisor who logs the resignation and starts the case. */
    public static final String ASE = "sales-ase";
    public static final String RSE = "sales-rse";
    public static final String ZSI = "sales-zsi";
    public static final String SALES_MANAGER = "sales-sm";
    public static final String GENERAL_MANAGER = "sales-gm";

    /** SSR, the sales admin desk that routes both documents onward (spreadsheet step 3). */
    public static final String SALES_ADMIN = "sales-ssr";
    public static final String DIRECTOR_MARKETING = "director-mkt";
    public static final String SIMU = "sales-simu";
    public static final String IB = "sales-ib";

    public static final String SBM = "sbm";
    /** GAD, who clears the company motorcycle (spreadsheet step 6). */
    public static final String GAD = "gad";
    public static final String FCA = "fca";

    public static final String HRM = "hrm";
    public static final String HEAD_OF_HR = "head-of-hr";

    public static final String ACC_OFFICER = "acc-officer";
    public static final String ACC_MANAGER = "acc-manager";
    public static final String ACC_DIRECTOR = "acc-director";

    /**
     * The "Reception Box" of step 8.2, where the signed acceptance letter is left for
     * collection. A destination, not an approver: it holds no task, only a notification.
     */
    public static final String RECEPTION = "reception";

    private static final List<String> ALL = Collections.unmodifiableList(Arrays.asList(
            SALES_FIELD, ASE, RSE, ZSI, SALES_MANAGER, GENERAL_MANAGER,
            SALES_ADMIN, DIRECTOR_MARKETING, SIMU, IB,
            SBM, GAD, FCA,
            HRM, HEAD_OF_HR,
            ACC_OFFICER, ACC_MANAGER, ACC_DIRECTOR,
            RECEPTION));

    /** Every group the models reference, in the order the work reaches them. */
    public static List<String> all() {
        return ALL;
    }

    private ResignationRoles() {
    }
}
