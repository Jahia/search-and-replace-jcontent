package org.jahia.modules.searchandreplace.service;

import org.jahia.services.content.JCRNodeIteratorWrapper;
import org.jahia.services.content.JCRNodeWrapper;
import org.jahia.services.content.JCRPropertyWrapper;
import org.jahia.services.content.nodetypes.ExtendedNodeType;
import org.jahia.services.content.nodetypes.ExtendedPropertyDefinition;

import javax.jcr.RepositoryException;
import javax.jcr.Value;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Computes, and optionally writes, the replacement of a term in the scope of a node
 * ({@link ReplaceScope}), on its text fields only ({@link TextFields}).
 * <p>
 * The node must come from a session opened for the calling user and the target language: i18n
 * properties are then read and written in that language, and the repository enforces the user's
 * rights (read, write, per-language write) on every node. Nothing is saved here; the caller saves the
 * session. Stateless; a call must stay on the thread that owns the session.
 */
public final class ReplaceEngine {

    /**
     * What to replace.
     */
    public static final class Request {
        private final String term;
        private final String replacement;
        private final TextReplacer.Mode mode;
        private final Collection<String> propertyFilter;

        /**
         * @param term           the term to find, not empty
         * @param replacement    the replacement, {@code null} is an empty string
         * @param mode           how the term is matched
         * @param propertyFilter the property names to change, or {@code null} for every text field
         */
        public Request(String term, String replacement, TextReplacer.Mode mode, Collection<String> propertyFilter) {
            this.term = term;
            this.replacement = replacement;
            this.mode = mode;
            this.propertyFilter = propertyFilter == null ? null : Collections.unmodifiableList(new ArrayList<>(propertyFilter));
        }
    }

    /**
     * One property that the replacement changes.
     */
    public static final class Change {
        private final String nodeIdentifier;
        private final String nodePath;
        private final String propertyName;
        private final String oldValue;
        private final String newValue;

        Change(String nodeIdentifier, String nodePath, String propertyName, String oldValue, String newValue) {
            this.nodeIdentifier = nodeIdentifier;
            this.nodePath = nodePath;
            this.propertyName = propertyName;
            this.oldValue = oldValue;
            this.newValue = newValue;
        }

        /** @return the identifier of the node that holds the property */
        public String getNodeIdentifier() {
            return nodeIdentifier;
        }

        /** @return the path of the node that holds the property */
        public String getNodePath() {
            return nodePath;
        }

        /** @return the property name */
        public String getPropertyName() {
            return propertyName;
        }

        /** @return the current value (values of a multiple property joined with a line break) */
        public String getOldValue() {
            return oldValue;
        }

        /** @return the value after replacement (same format as {@link #getOldValue()}) */
        public String getNewValue() {
            return newValue;
        }
    }

    private ReplaceEngine() {
    }

    /**
     * Lists, and when {@code write} is {@code true} applies, every change in the scope of the root node.
     *
     * @param root    the selected node, read with the calling user's session in the target language
     * @param request what to replace
     * @param write   {@code true} to set the new values on the session, {@code false} for a preview
     * @return the changes, in tree order; empty when nothing matches
     * @throws RepositoryException when a node cannot be read or a value cannot be written (missing
     *                             right, lock); nothing is saved
     */
    public static List<Change> apply(JCRNodeWrapper root, Request request, boolean write) throws RepositoryException {
        List<Change> changes = new ArrayList<>();
        visit(root, request, write, changes);
        return changes;
    }

    private static void visit(JCRNodeWrapper node, Request request, boolean write, List<Change> changes) throws RepositoryException {
        for (Map.Entry<String, TextFields.Kind> field : textFields(node).entrySet()) {
            String name = field.getKey();
            if (request.propertyFilter != null && !request.propertyFilter.contains(name)) {
                continue;
            }
            if (!node.hasProperty(name)) {
                continue;
            }
            replaceProperty(node, node.getProperty(name), field.getValue(), request, write, changes);
        }

        if (!ReplaceScope.coversChildrenOf(node)) {
            return;
        }
        JCRNodeIteratorWrapper children = node.getNodes();
        while (children.hasNext()) {
            JCRNodeWrapper child = (JCRNodeWrapper) children.nextNode();
            if (!ReplaceScope.isOutside(child)) {
                visit(child, request, write, changes);
            }
        }
    }

    private static void replaceProperty(JCRNodeWrapper node, JCRPropertyWrapper property, TextFields.Kind kind,
                                        Request request, boolean write, List<Change> changes) throws RepositoryException {
        String name = property.getName();
        if (property.isMultiple()) {
            Value[] values = property.getValues();
            String[] oldValues = new String[values.length];
            String[] newValues = new String[values.length];
            for (int i = 0; i < values.length; i++) {
                oldValues[i] = values[i] == null ? null : values[i].getString();
                newValues[i] = TextReplacer.replace(oldValues[i], request.term, request.replacement, request.mode, kind);
            }
            if (!Arrays.equals(oldValues, newValues)) {
                if (write) {
                    node.setProperty(name, newValues);
                }
                changes.add(new Change(node.getIdentifier(), node.getPath(), name,
                        String.join("\n", oldValues), String.join("\n", newValues)));
            }
            return;
        }

        String oldValue = property.getString();
        String newValue = TextReplacer.replace(oldValue, request.term, request.replacement, request.mode, kind);
        if (!Objects.equals(oldValue, newValue)) {
            if (write) {
                node.setProperty(name, newValue);
            }
            changes.add(new Change(node.getIdentifier(), node.getPath(), name, oldValue, newValue));
        }
    }

    /**
     * Lists the text fields that the node's types declare, by name.
     */
    private static Map<String, TextFields.Kind> textFields(JCRNodeWrapper node) throws RepositoryException {
        Map<String, TextFields.Kind> fields = new LinkedHashMap<>();
        addTextFields(node.getPrimaryNodeType(), fields);
        for (ExtendedNodeType mixin : node.getMixinNodeTypes()) {
            addTextFields(mixin, fields);
        }
        return fields;
    }

    private static void addTextFields(ExtendedNodeType type, Map<String, TextFields.Kind> fields) {
        for (ExtendedPropertyDefinition definition : type.getPropertyDefinitions()) {
            TextFields.Kind kind = TextFields.kindOf(definition);
            if (kind != null) {
                fields.putIfAbsent(definition.getName(), kind);
            }
        }
    }
}
