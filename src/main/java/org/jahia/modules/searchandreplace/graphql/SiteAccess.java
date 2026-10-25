package org.jahia.modules.searchandreplace.graphql;

import org.jahia.modules.graphql.provider.dxm.BaseGqlClientException;
import org.jahia.services.content.JCRNodeWrapper;
import org.jahia.services.content.JCRSessionFactory;
import org.jahia.services.content.JCRSessionWrapper;
import org.jahia.utils.LanguageCodeConverters;

import javax.jcr.PathNotFoundException;
import javax.jcr.RepositoryException;
import java.util.Collections;

/**
 * Opens the caller's session and checks who may use search and replace on a site.
 * <p>
 * Every field runs with the session of the calling user in the {@code default} workspace, so node
 * ACLs and per-language write rights apply to each read and write. On top of that, the caller must
 * hold the {@value #PERMISSION} permission on the site node (declared under {@code site-admin} in
 * {@code src/main/import/permissions.xml}, so site administrators hold it and it can be granted
 * alone). A missing site and a missing permission give the same answer.
 */
final class SiteAccess {

    /** Permission required on the site node. */
    static final String PERMISSION = "searchAndReplace";

    private static final String DENIED = "Permission denied";

    private SiteAccess() {
    }

    // Same shape as the platform's own refusal (GqlAccessDeniedException): no error type, so the
    // bundle does not import graphql-java, whose exported version changes between Jahia releases.
    private static BaseGqlClientException denied() {
        return new BaseGqlClientException(DENIED, null, Collections.emptyMap());
    }

    /**
     * Returns the calling user's session on the {@code default} workspace in the given language.
     *
     * @param language a validated language code
     * @return the request's session for that user, workspace and locale
     * @throws RepositoryException when the session cannot be opened
     */
    static JCRSessionWrapper openEditSession(String language) throws RepositoryException {
        return JCRSessionFactory.getInstance()
                .getCurrentUserSession("default", LanguageCodeConverters.languageCodeToLocale(language));
    }

    /**
     * Fails unless the session's user holds {@value #PERMISSION} on the site.
     *
     * @param session the caller's session
     * @param siteKey a validated site key
     * @return the site node
     * @throws BaseGqlClientException "Permission denied" when the site is missing, unreadable, or the
     *                                permission is not granted
     */
    static JCRNodeWrapper requirePermission(JCRSessionWrapper session, String siteKey) throws RepositoryException {
        JCRNodeWrapper site;
        try {
            site = session.getNode("/sites/" + siteKey);
        } catch (PathNotFoundException e) {
            throw denied();
        }
        if (!site.isNodeType("jnt:virtualsite") || !site.hasPermission(PERMISSION)) {
            throw denied();
        }
        return site;
    }
}
