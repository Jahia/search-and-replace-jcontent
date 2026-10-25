import React from 'react';
import {useSelector} from 'react-redux';
import {useTranslation} from 'react-i18next';
import {useNodeChecks} from '@jahia/data-helper';
import {Loader, Typography} from '@jahia/moonstone';
import {SearchAndReplace} from '../SearchAndReplace';
import PropTypes from 'prop-types';

export const SEARCH_AND_REPLACE_PERMISSION = 'searchAndReplace';

/**
 * Renders the tool only for a user holding the searchAndReplace permission on a site where the
 * module is enabled. The server checks the same permission on every field; this gate only spares
 * the user a screen whose calls would be refused.
 */
export const AdminPanel = ({match}) => {
    const {t} = useTranslation('search-and-replace');
    const currentSite = useSelector(state => state.site);
    const siteKey = match?.params?.siteKey || currentSite || window.contextJsParameters?.siteKey || '';
    const {checksResult, loading} = useNodeChecks(
        {path: `/sites/${siteKey}`},
        {
            requiredPermission: [SEARCH_AND_REPLACE_PERMISSION],
            requireModuleInstalledOnSite: ['search-and-replace']
        },
        {skip: !siteKey}
    );

    if (loading) {
        return <Loader size="big"/>;
    }

    if (!checksResult) {
        return <Typography variant="body">{t('label.noPermission')}</Typography>;
    }

    return <SearchAndReplace key={siteKey} siteKey={siteKey}/>;
};

AdminPanel.propTypes = {
    match: PropTypes.object
};

export default AdminPanel;
