package org.jahia.modules.searchandreplace.service;

import org.jahia.services.content.JCRNodeWrapper;

import javax.jcr.RepositoryException;
import java.util.Arrays;
import java.util.List;

/**
 * Defines what belongs to a node for search and replace: the node itself and its descendants down to
 * the next node that has a life of its own (a page, a main resource such as a news item, a folder).
 * Selecting a page therefore covers the content of its areas, never its sub-pages. Search and replace
 * use the same boundary, so a result row lists exactly what a replacement changes.
 */
public final class ReplaceScope {

    private static final List<String> BOUNDARY_TYPES = Arrays.asList(
            "jnt:page", "jmix:mainResource", "jnt:contentFolder", "jnt:folder", "jnt:virtualsite");
    private static final String TRANSLATION_PREFIX = "j:translation_";

    private ReplaceScope() {
    }

    /**
     * Tells whether a child is left out of its parent's scope.
     *
     * @param child a child node of a node in scope
     * @return {@code true} for translation nodes and for nodes that start a scope of their own
     * @throws RepositoryException when the node types cannot be read
     */
    public static boolean isOutside(JCRNodeWrapper child) throws RepositoryException {
        if (child.getName().startsWith(TRANSLATION_PREFIX)) {
            return true;
        }
        for (String type : BOUNDARY_TYPES) {
            if (child.isNodeType(type)) {
                return true;
            }
        }
        return false;
    }
}
