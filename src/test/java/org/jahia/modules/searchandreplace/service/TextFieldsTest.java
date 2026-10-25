package org.jahia.modules.searchandreplace.service;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class TextFieldsTest {

    @Test
    public void systemNamesAreRefusedExceptTitleAndDescription() {
        assertTrue(TextFields.isEditableName("jcr:title"));
        assertTrue(TextFields.isEditableName("jcr:description"));
        assertTrue(TextFields.isEditableName("text"));
        assertTrue(TextFields.isEditableName("seo:keywords"));
        assertFalse(TextFields.isEditableName("j:url"));
        assertFalse(TextFields.isEditableName("j:tagList"));
        assertFalse(TextFields.isEditableName("wem:jsonFilter"));
        assertFalse(TextFields.isEditableName("jcr:uuid"));
        assertFalse(TextFields.isEditableName(""));
        assertFalse(TextFields.isEditableName(null));
    }

    @Test
    public void missingNodeOrDefinitionIsNotText() {
        assertNull(TextFields.kindOf(null, "text"));
        assertNull(TextFields.kindOf((org.jahia.services.content.nodetypes.ExtendedPropertyDefinition) null));
    }
}
