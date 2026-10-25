/* eslint-disable react/no-danger */
import React, {useCallback, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Button, Chip, DataTable, Typography} from '@jahia/moonstone';
import PropTypes from 'prop-types';
import dayjs from 'dayjs';
import styles from '../SearchAndReplace.scss';
import {isHtmlContent, renderHighlightedText, sanitizeAndHighlightHtml} from '../utils/highlight.utils';

// Matches shown in a row before "Show all"
const VISIBLE_MATCHES = 2;
// The selection column has a fixed width inside DataTable; the data columns share the rest.
const DATA_WIDTH = '(100% - 48px)';
const width = share => `calc(${DATA_WIDTH} * ${share})`;

/**
 * Builds the URL of the jContent screen that shows the parent page or content folder of a result.
 */
const buildParentLink = (parentContainerPath, siteKey, language) => {
    if (!parentContainerPath || !siteKey || !language) {
        return '';
    }

    const contextPath = window.contextJsParameters?.contextPath || '';
    const sitePrefix = `/sites/${siteKey}/`;
    const relativePath = (parentContainerPath.startsWith(sitePrefix) ?
        parentContainerPath.substring(sitePrefix.length) :
        parentContainerPath).replace(/^\/+|\/+$/g, '');
    const section = relativePath === 'contents' || relativePath.startsWith('contents/') ? 'content-folders' : 'pages';
    const suffix = relativePath ? `/${relativePath}` : '';

    return `${contextPath}/jahia/jcontent/${siteKey}/${language}/${section}${suffix}`;
};

const MatchValue = ({value, searchTerm, keyPrefix}) => (
    isHtmlContent(value) ? (
        <div
            dangerouslySetInnerHTML={{__html: sanitizeAndHighlightHtml(value, searchTerm, styles.highlight)}}
            className={styles.matchValueHtml}
        />
    ) : (
        <Typography variant="caption" className={styles.matchValue}>
            {renderHighlightedText(value, searchTerm, styles.highlight, keyPrefix)}
        </Typography>
    )
);

MatchValue.propTypes = {
    value: PropTypes.string,
    searchTerm: PropTypes.string.isRequired,
    keyPrefix: PropTypes.string.isRequired
};

/**
 * The matching properties of one result: the first ones, then all on demand. A property that the
 * replacement would not change is marked read-only.
 */
const MatchesCell = ({node, searchTerm}) => {
    const {t} = useTranslation('search-and-replace');
    const [showAll, setShowAll] = useState(false);
    const matches = (node.matchingProperties || []).filter(match => match && match.name);
    const visible = showAll ? matches : matches.slice(0, VISIBLE_MATCHES);

    return (
        <div className={styles.matches}>
            {visible.map((match, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <div key={`${match.label}-${index}`} className={styles.match}>
                    <div className={styles.matchHeader}>
                        <Typography variant="caption" weight="bold">{match.label || match.name}</Typography>
                        {!match.replaceable && <Chip label={t('label.readOnly')} color="warning"/>}
                    </div>
                    <MatchValue value={match.value} searchTerm={searchTerm} keyPrefix={`${node.uuid}-${index}`}/>
                </div>
            ))}
            {matches.length > VISIBLE_MATCHES && (
                <Button
                    variant="ghost"
                    size="small"
                    label={showAll ?
                        t('label.showFewerMatches') :
                        t('label.showAllMatches', {count: matches.length})}
                    aria-expanded={showAll}
                    onClick={() => setShowAll(!showAll)}
                />
            )}
        </div>
    );
};

MatchesCell.propTypes = {
    node: PropTypes.object.isRequired,
    searchTerm: PropTypes.string.isRequired
};

/**
 * Results of a search, in a Moonstone DataTable: selection, pagination, and the matching properties
 * of each node in its row.
 */
export const ResultsTable = ({nodes, searchTerm, selectedLanguage, siteKey, selectedNodes, onSelectionChange}) => {
    const {t} = useTranslation('search-and-replace');
    const rows = useMemo(() => nodes.filter(node => node && node.uuid), [nodes]);
    const formatDate = useCallback(value => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : ''), []);

    const columns = useMemo(() => [
        {
            key: 'displayName',
            label: t('label.name'),
            width: width(0.22),
            render: ({data}) => (
                <Typography variant="body" weight="bold" className={`${styles.wrap} ${styles.clamp}`} title={data.displayName || data.name}>
                    {data.displayName || data.name}
                </Typography>
            )
        },
        {
            key: 'nodeTypeLabel',
            label: t('label.contentType'),
            width: width(0.13),
            render: ({data}) => (
                <Typography variant="caption" className={styles.wrap} title={data.nodeType}>
                    {data.nodeTypeLabel || data.nodeType}
                </Typography>
            )
        },
        {
            key: 'path',
            label: t('label.path'),
            width: width(0.24),
            render: ({data}) => (
                <div className={styles.pathCell}>
                    <Typography variant="caption" className={styles.wrap}>{data.path}</Typography>
                    {data.parentContainerPath && (
                        <a
                            href={buildParentLink(data.parentContainerPath, siteKey, selectedLanguage)}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.parentLink}
                        >
                            {t('label.openParentShort')}
                        </a>
                    )}
                </div>
            )
        },
        {
            key: 'lastModified',
            label: t('label.modified'),
            width: width(0.11),
            render: ({data}) => <Typography variant="caption">{formatDate(data.lastModified)}</Typography>
        },
        {
            key: 'matchingProperties',
            label: t('label.matches'),
            width: width(0.30),
            render: ({data}) => <MatchesCell node={data} searchTerm={searchTerm}/>
        }
    ], [t, siteKey, selectedLanguage, searchTerm, formatDate]);

    return (
        <div className={styles.tableBox}>
            <DataTable
                enableSelection
                enablePagination
                className={styles.resultsTable}
                aria-label={t('label.resultsTable')}
                primaryKey="uuid"
                data={rows}
                columns={columns}
                selection={selectedNodes}
                defaultItemsPerPage={25}
                itemsPerPageOptions={[25, 50, 100, 200]}
                i18n={{itemsPerPage: t('label.itemsPerPage'), of: t('label.of')}}
                onChangeSelection={onSelectionChange}
            />
        </div>
    );
};

ResultsTable.propTypes = {
    nodes: PropTypes.array.isRequired,
    searchTerm: PropTypes.string.isRequired,
    selectedLanguage: PropTypes.string,
    siteKey: PropTypes.string,
    selectedNodes: PropTypes.array.isRequired,
    onSelectionChange: PropTypes.func.isRequired
};

export default ResultsTable;
