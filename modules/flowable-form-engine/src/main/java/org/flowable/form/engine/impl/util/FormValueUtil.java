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
package org.flowable.form.engine.impl.util;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Date;

import org.apache.commons.lang3.StringUtils;

/**
 * The one place that decides how form values map to variables and back (FORM_REQUIREMENTS.md
 * FR-M.10, FR-M.11): dates are ISO {@code yyyy-MM-dd} on the wire and {@link LocalDate} in
 * variables; {@code amount} and {@code decimal} are {@link BigDecimal}; {@code integer} is
 * {@link Long}.
 */
public final class FormValueUtil {

    public static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE;

    private FormValueUtil() {
    }

    /** Renders any date-like variable as an ISO date string; anything else is returned unchanged. */
    public static Object toDateFieldValue(Object variableValue) {
        LocalDate date = toLocalDate(variableValue);
        return date != null ? DATE_FORMAT.format(date) : variableValue;
    }

    /**
     * Converts a submitted date value to a {@link LocalDate}. Returns {@code null} for empty input.
     *
     * @throws DateTimeParseException when the string is not an ISO date
     */
    public static LocalDate toLocalDate(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof LocalDate) {
            return (LocalDate) value;
        }
        if (value instanceof LocalDateTime) {
            return ((LocalDateTime) value).toLocalDate();
        }
        if (value instanceof Instant) {
            return ((Instant) value).atZone(ZoneId.systemDefault()).toLocalDate();
        }
        if (value instanceof Date) {
            return ((Date) value).toInstant().atZone(ZoneId.systemDefault()).toLocalDate();
        }
        if (value instanceof CharSequence) {
            String text = value.toString().trim();
            if (StringUtils.isEmpty(text)) {
                return null;
            }
            // Tolerate a full date-time so a datetime-local input still lands as a date.
            if (text.length() > 10 && text.charAt(10) == 'T') {
                return LocalDateTime.parse(text).toLocalDate();
            }
            return LocalDate.parse(text, DATE_FORMAT);
        }
        return null;
    }

    /**
     * Converts a submitted numeric value to a {@link BigDecimal}. Returns {@code null} for empty input.
     *
     * @throws NumberFormatException when the string is not a number
     */
    public static BigDecimal toBigDecimal(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof BigDecimal) {
            return (BigDecimal) value;
        }
        if (value instanceof Number) {
            return new BigDecimal(value.toString());
        }
        String text = value.toString().trim();
        if (StringUtils.isEmpty(text)) {
            return null;
        }
        return new BigDecimal(text);
    }

    /**
     * Converts a submitted integer value to a {@link Long}. Returns {@code null} for empty input.
     *
     * @throws NumberFormatException when the string is not a whole number
     */
    public static Long toLong(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Long) {
            return (Long) value;
        }
        if (value instanceof Number) {
            BigDecimal decimal = new BigDecimal(value.toString());
            return decimal.longValueExact();
        }
        String text = value.toString().trim();
        if (StringUtils.isEmpty(text)) {
            return null;
        }
        return Long.valueOf(text);
    }
}
