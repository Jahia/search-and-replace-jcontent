package org.jahia.modules.searchandreplace.service;

import org.jahia.services.content.JCRNodeWrapper;
import org.jahia.services.content.nodetypes.ExtendedPropertyDefinition;
import org.jahia.services.content.nodetypes.SelectorType;

import javax.jcr.PropertyType;
import javax.jcr.RepositoryException;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Decides which properties of a node hold text that an editor writes, and therefore may be replaced.
 * <p>
 * A property qualifies when its definition is a non-protected, non-hidden {@code string} edited with
 * a small text, text area or rich text selector and without value constraints (choicelists).
 * System namespaces ({@code jcr:}, {@code j:}, {@code wem:}...) are refused, except {@code jcr:title}
 * and {@code jcr:description}. Everything else (URLs, JSON, references, node names, choicelist keys)
 * is left untouched. Stateless and thread-safe.
 */
public final class TextFields {

    /**
     * How a text field must be replaced.
     */
    public enum Kind {
        /** Plain text: the whole value is text. */
        PLAIN,
        /** Rich text: HTML whose text nodes are replaced, never its markup. */
        HTML
    }

    private static final Set<String> ALLOWED_SYSTEM_PROPERTIES = Collections.unmodifiableSet(
            new HashSet<>(Arrays.asList("jcr:title", "jcr:description")));
    private static final List<String> SYSTEM_PREFIXES = Arrays.asList(
            "jcr:", "j:", "wem:", "rep:", "mix:", "nt:", "jmix:", "jnt:");

    private TextFields() {
    }

    /**
     * Returns how the property of the node may be replaced.
     *
     * @param node         the node that holds the property (for an i18n property, the node itself,
     *                     never its translation node)
     * @param propertyName the property name
     * @return the kind of text, or {@code null} when the property must not be replaced
     */
    public static Kind kindOf(JCRNodeWrapper node, String propertyName) {
        if (node == null || !isEditableName(propertyName)) {
            return null;
        }
        try {
            return kindOf(node.getApplicablePropertyDefinition(propertyName));
        } catch (RepositoryException e) {
            // No definition applies (a residual or a removed property): not a text field.
            return null;
        }
    }

    /**
     * Returns how a property with this definition may be replaced.
     *
     * @param definition the property definition, may be {@code null}
     * @return the kind of text, or {@code null} when the property must not be replaced
     */
    public static Kind kindOf(ExtendedPropertyDefinition definition) {
        if (definition == null
                || definition.getRequiredType() != PropertyType.STRING
                || definition.isProtected()
                || definition.isHidden()
                || "*".equals(definition.getName())
                || !isEditableName(definition.getName())) {
            return null;
        }
        String[] constraints = definition.getValueConstraints();
        if (constraints != null && constraints.length > 0) {
            return null;
        }
        switch (definition.getSelector()) {
            case SelectorType.RICHTEXT:
                return Kind.HTML;
            case SelectorType.SMALLTEXT:
            case SelectorType.TEXTAREA:
                return Kind.PLAIN;
            default:
                return null;
        }
    }

    /**
     * Tells whether a property name lies outside the system namespaces.
     *
     * @param propertyName the property name
     * @return {@code true} for {@code jcr:title}, {@code jcr:description} and non-system names
     */
    static boolean isEditableName(String propertyName) {
        if (propertyName == null || propertyName.isEmpty()) {
            return false;
        }
        if (ALLOWED_SYSTEM_PROPERTIES.contains(propertyName)) {
            return true;
        }
        for (String prefix : SYSTEM_PREFIXES) {
            if (propertyName.startsWith(prefix)) {
                return false;
            }
        }
        return true;
    }
}
