import {registry} from '@jahia/ui-extender';
import {AdminPanel} from './AdminPanel';
import React, {Suspense} from 'react';
import {Loader} from '@jahia/moonstone';

const CONTENT_TOOLS_ACCORDION_TYPE = 'accordionItem';
const CONTENT_TOOLS_ACCORDION_KEY = 'contentToolsAccordion';
const CONTENT_TOOLS_APPS_TARGET = 'contentToolsAccordionApps';
const ADMIN_ROUTE_TYPE = 'adminRoute';
const ADMIN_ROUTE_KEY = 'SearchAndReplaceAction';
const MODULE_KEY = 'search-and-replace';

const ensureContentToolsAccordion = () => {
    const existingAccordion = window.jahia.uiExtender.registry.get(CONTENT_TOOLS_ACCORDION_TYPE, CONTENT_TOOLS_ACCORDION_KEY);

    if (existingAccordion) {
        return;
    }

    registry.add(CONTENT_TOOLS_ACCORDION_TYPE, CONTENT_TOOLS_ACCORDION_KEY, registry.get(CONTENT_TOOLS_ACCORDION_TYPE, 'renderDefaultApps'), {
        targets: ['jcontent:75'],
        icon: window.jahia.moonstone.toIconComponent('<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M4 5h16v3H4zM4 10h16v3H4zM4 15h10v3H4z"/><path d="M18.5 15v2.5H16v1h2.5V21h1v-2.5H22v-1h-2.5V15z"/></svg>'),
        label: 'search-and-replace:accordion.title',
        appsTarget: CONTENT_TOOLS_APPS_TARGET
    });
};

export const registerRoutes = () => {
    ensureContentToolsAccordion();

    const existingRoute = registry.get(ADMIN_ROUTE_TYPE, ADMIN_ROUTE_KEY);
    if (existingRoute) {
        return;
    }

    registry.add(ADMIN_ROUTE_TYPE, ADMIN_ROUTE_KEY, {
        targets: [CONTENT_TOOLS_APPS_TARGET],
        icon: window.jahia.moonstone.toIconComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="5"></circle><line x1="13" y1="13" x2="18" y2="18"></line><path d="M15 5h4v4"></path><path d="M19 9c0-2.2-1.8-4-4-4"></path><path d="M9 19H5v-4"></path><path d="M5 15c0 2.2 1.8 4 4 4"></path></svg>'), label: 'search-and-replace:label.menu',
        isSelectable: true,
        requireModuleInstalledOnSite: MODULE_KEY,
        requiredPermission: 'searchAndReplace',
        render: () => <Suspense fallback={<Loader size="big"/>}><AdminPanel/></Suspense>
    });
};
