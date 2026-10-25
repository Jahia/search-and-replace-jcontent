import React, {useState, useCallback, useMemo, useEffect} from 'react';
import {useTranslation} from 'react-i18next';
import {useQuery} from '@apollo/client';
import {
    Header,
    LayoutContent,
    Typography,
    Input,
    Dropdown,
    Button,
    Chip,
    CheckboxItem,
    Loader
} from '@jahia/moonstone';
import PropTypes from 'prop-types';
import {GET_SITE_LANGUAGES_QUERY, SEARCH_NODES_QUERY} from './SearchAndReplace.gql-queries';
import {SearchFilters} from './components/SearchFilters';
import {ResultsTable} from './components/ResultsTable';
import {ReplaceModal} from './components/ReplaceModal';
import styles from './SearchAndReplace.scss';

// Rows asked from the server per search; the server caps the batch of a replacement at the same size.
const SEARCH_RESULT_LIMIT = 200;

/**
 * Main Search and Replace Component
 * Provides a modern UI for searching and replacing text in JCR nodes
 */
// eslint-disable-next-line complexity
export const SearchAndReplace = ({siteKey}) => {
    const {t, i18n} = useTranslation('search-and-replace');
    const uiLanguage = i18n?.language || 'en';

    // State management
    const [searchTerm, setSearchTerm] = useState('');
    const [currentSearchTerm, setCurrentSearchTerm] = useState('');
    const [filters, setFilters] = useState({});
    const [showFilters, setShowFilters] = useState(false);
    const [selectedNodes, setSelectedNodes] = useState([]);
    const [replaceModalOpen, setReplaceModalOpen] = useState(false);
    const [selectedLanguage, setSelectedLanguage] = useState((i18n?.language || 'en').split('-')[0]);
    const [deepSearch, setDeepSearch] = useState(false);

    const sanitizeFiltersPayload = useCallback(rawFilters => {
        if (!rawFilters || typeof rawFilters !== 'object') {
            return {};
        }

        return Object.entries(rawFilters).reduce((acc, [key, value]) => {
            if (value === null || value === undefined) {
                return acc;
            }

            if (Array.isArray(value)) {
                if (value.length > 0) {
                    acc[key] = value;
                }

                return acc;
            }

            const normalizedValue = typeof value === 'string' ? value.trim() : value;
            if (normalizedValue === '') {
                return acc;
            }

            acc[key] = normalizedValue;
            return acc;
        }, {});
    }, []);

    const normalizedFilters = useMemo(() => sanitizeFiltersPayload(filters), [filters, sanitizeFiltersPayload]);

    const {data: siteLanguagesData} = useQuery(GET_SITE_LANGUAGES_QUERY, {
        variables: {
            workspace: 'EDIT',
            scope: `/sites/${siteKey}`
        },
        skip: !siteKey,
        fetchPolicy: 'cache-first'
    });

    const siteLanguages = useMemo(() => {
        return siteLanguagesData?.jcr?.nodeByPath?.languages?.values || [];
    }, [siteLanguagesData]);
    const languageOptions = siteLanguages.length > 0 ? siteLanguages : [selectedLanguage];
    const languageDisplayNames = useMemo(() => {
        if (typeof Intl === 'undefined' || typeof Intl.DisplayNames !== 'function') {
            return null;
        }

        try {
            return new Intl.DisplayNames([uiLanguage], {type: 'language'});
        } catch (_) {
            return null;
        }
    }, [uiLanguage]);
    const getLanguageLabel = useCallback(language => {
        if (!language) {
            return '';
        }

        const normalizedLanguage = language.replace('_', '-');
        const lowerCaseCode = normalizedLanguage.toLowerCase();
        let displayName = normalizedLanguage;

        if (languageDisplayNames) {
            displayName = languageDisplayNames.of(normalizedLanguage) ||
                languageDisplayNames.of(normalizedLanguage.split('-')[0]) ||
                normalizedLanguage;
        }

        return `${displayName} (${lowerCaseCode})`;
    }, [languageDisplayNames]);
    const languageDropdownData = useMemo(() => {
        return languageOptions.map(language => ({
            label: getLanguageLabel(language),
            value: language
        }));
    }, [languageOptions, getLanguageLabel]);

    useEffect(() => {
        if (siteLanguages.length === 0) {
            return;
        }

        if (!siteLanguages.includes(selectedLanguage)) {
            setSelectedLanguage(siteLanguages[0]);
        }
    }, [siteLanguages, selectedLanguage]);

    // GraphQL query for search
    const {data, loading, error, refetch} = useQuery(SEARCH_NODES_QUERY, {
        variables: {
            termToSearch: currentSearchTerm,
            siteKey,
            language: selectedLanguage,
            filters: Object.keys(normalizedFilters).length > 0 ? normalizedFilters : null,
            limit: SEARCH_RESULT_LIMIT,
            deepSearch
        },
        skip: !currentSearchTerm || currentSearchTerm.trim() === '',
        fetchPolicy: 'network-only'
    });

    // Search handler
    const handleSearch = useCallback(() => {
        if (searchTerm.trim()) {
            setCurrentSearchTerm(searchTerm);
            setSelectedNodes([]);
        }
    }, [searchTerm]);

    // Enter key handler
    const handleKeyPress = useCallback(event => {
        if (event.key === 'Enter') {
            handleSearch();
        }
    }, [handleSearch]);

    // Filter change handler
    const handleFiltersChange = useCallback(newFilters => {
        setFilters(sanitizeFiltersPayload(newFilters));
        setSelectedNodes([]);
    }, [sanitizeFiltersPayload]);

    // Clear all
    const handleClear = useCallback(() => {
        setSearchTerm('');
        setCurrentSearchTerm('');
        setFilters({});
        setSelectedNodes([]);
    }, []);

    // Replace handler
    const handleReplace = useCallback(() => {
        if (selectedNodes.length > 0) {
            setReplaceModalOpen(true);
        }
    }, [selectedNodes]);

    // Replace complete handler
    const handleReplaceComplete = useCallback(() => {
        setReplaceModalOpen(false);
        setSelectedNodes([]);
        refetch();
    }, [refetch]);

    const searchResults = data?.searchAndReplace?.searchNodes || null;
    const rawNodes = Array.isArray(searchResults?.nodes) ? searchResults.nodes : [];
    const selectedContentType = normalizedFilters.nodeType;
    const filteredNodes = useMemo(() => {
        const parseBoundary = (dateValue, endOfDay = false) => {
            if (!dateValue || typeof dateValue !== 'string') {
                return null;
            }

            const normalizedDate = dateValue.trim();
            if (!normalizedDate) {
                return null;
            }

            let isoDate = normalizedDate;
            const slashDateMatch = normalizedDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            const dashDateMatch = normalizedDate.match(/^(\d{2})-(\d{2})-(\d{4})$/);
            if (slashDateMatch || dashDateMatch) {
                const dateMatch = slashDateMatch || dashDateMatch;
                isoDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
            }

            const parsedDate = new Date(`${isoDate}${endOfDay ? 'T23:59:59.999' : 'T00:00:00.000'}`);
            return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
        };

        const matchesDateRange = (nodeDateValue, startDate, endDate) => {
            if (!startDate && !endDate) {
                return true;
            }

            if (!nodeDateValue) {
                return false;
            }

            const parsedNodeDate = new Date(nodeDateValue);
            if (Number.isNaN(parsedNodeDate.getTime())) {
                return false;
            }

            if (startDate && parsedNodeDate < startDate) {
                return false;
            }

            return !(endDate && parsedNodeDate > endDate);
        };

        const createdAfterDate = parseBoundary(normalizedFilters.createdAfter, false);
        const createdBeforeDate = parseBoundary(normalizedFilters.createdBefore, true);
        const modifiedAfterDate = parseBoundary(normalizedFilters.modifiedAfter, false);
        const modifiedBeforeDate = parseBoundary(normalizedFilters.modifiedBefore, true);

        return rawNodes.filter(node => {
            if (!node) {
                return false;
            }

            if (selectedContentType && node.nodeType !== selectedContentType) {
                return false;
            }

            if (!matchesDateRange(node.created, createdAfterDate, createdBeforeDate)) {
                return false;
            }

            return matchesDateRange(node.lastModified, modifiedAfterDate, modifiedBeforeDate);
        });
    }, [rawNodes, selectedContentType, normalizedFilters]);
    const hasResults = filteredNodes.length > 0;
    const availableNodeTypes = useMemo(() => {
        const types = new Set();
        rawNodes.forEach(node => {
            if (node?.nodeType) {
                types.add(node.nodeType);
            }
        });
        return Array.from(types);
    }, [rawNodes]);
    const activeFilterCount = Object.keys(normalizedFilters).length;
    const displayedResultCount = filteredNodes.length;

    const headerActions = [
        currentSearchTerm && (
            <Button
                key="clear"
                label={t('label.clear')}
                variant="outlined"
                size="big"
                onClick={handleClear}
            />
        ),
        <Button
            key="filters"
            label={activeFilterCount > 0 ? `${t('label.filters')} (${activeFilterCount})` : t('label.filters')}
            variant={showFilters ? 'default' : 'outlined'}
            color={activeFilterCount > 0 ? 'accent' : 'default'}
            size="big"
            aria-expanded={showFilters}
            onClick={() => setShowFilters(!showFilters)}
        />,
        selectedNodes.length > 0 && (
            <Button
                key="replace"
                label={selectedNodes.length === 1 ?
                    t('label.replaceInOneNode') :
                    t('label.replaceInNodes', {count: selectedNodes.length})}
                color="accent"
                size="big"
                onClick={handleReplace}
            />
        )
    ].filter(Boolean);

    return (
        <LayoutContent
            hasPadding
            className={styles.layout}
            data-snr-role="panel"
            header={<Header title={t('label.title', {siteInfo: siteKey})} mainActions={headerActions}/>}
        >
            <div className={styles.content}>
                <section className={styles.card} aria-labelledby="snr-search-heading">
                    <Typography component="h2" variant="heading" id="snr-search-heading">
                        {t('label.heroTitle')}
                    </Typography>
                    <Typography variant="body">{t('label.heroDescription')}</Typography>
                    <div className={styles.searchBar}>
                        <Input
                            autoFocus
                            className={styles.searchInput}
                            aria-label={t('label.searchPlaceholder')}
                            placeholder={t('label.searchPlaceholder')}
                            value={searchTerm}
                            size="big"
                            onChange={e => setSearchTerm(e.target.value)}
                            onKeyPress={handleKeyPress}
                        />
                        <Dropdown
                            className={styles.searchLanguageDropdown}
                            aria-label={t('label.language')}
                            data={languageDropdownData}
                            value={selectedLanguage}
                            size="medium"
                            variant="outlined"
                            onChange={(event, item) => {
                                if (item?.value) {
                                    setSelectedLanguage(item.value);
                                    setSelectedNodes([]);
                                }
                            }}
                        />
                        <Button
                            label={t('label.searchButton')}
                            color="accent"
                            size="big"
                            isDisabled={!searchTerm.trim()}
                            onClick={handleSearch}
                        />
                    </div>
                    <CheckboxItem
                        id="search-and-replace-deep-search"
                        value="deepSearch"
                        label={t('label.deepSearch')}
                        checked={deepSearch}
                        onChange={(event, value, checked) => {
                            setDeepSearch(checked);
                            setSelectedNodes([]);
                        }}
                    />
                    {currentSearchTerm && (
                        <div className={styles.chips}>
                            <Chip label={t('label.searchingFor', {term: currentSearchTerm})}/>
                            <Chip label={t('label.searchLanguage', {language: getLanguageLabel(selectedLanguage)})}/>
                            {activeFilterCount > 0 && (
                                <Chip label={t('label.activeFilters', {count: activeFilterCount})} color="accent"/>
                            )}
                        </div>
                    )}
                </section>

                {showFilters && (
                    <SearchFilters
                        availableNodeTypes={availableNodeTypes}
                        filters={normalizedFilters}
                        selectedLanguage={selectedLanguage}
                        siteKey={siteKey}
                        onFiltersChange={handleFiltersChange}
                    />
                )}

                {loading && (
                    <section className={`${styles.card} ${styles.state}`} aria-busy="true">
                        <Loader size="big"/>
                        <Typography variant="subheading">{t('label.searching')}</Typography>
                        <Typography variant="caption">{t('label.searchingDescription')}</Typography>
                    </section>
                )}

                {error && (
                    <section className={`${styles.card} ${styles.state}`} role="alert">
                        <Typography component="h2" variant="heading" color="danger">{t('label.errorTitle')}</Typography>
                        <Typography variant="body" color="danger">{error.message}</Typography>
                    </section>
                )}

                {!loading && !error && currentSearchTerm && !hasResults && (
                    <section className={`${styles.card} ${styles.state}`} role="status">
                        <Typography component="h2" variant="heading">{t('label.noResultsTitle')}</Typography>
                        <Typography variant="body">{t('label.noResultsDescription', {term: currentSearchTerm})}</Typography>
                        {activeFilterCount > 0 && (
                            <Button
                                label={t('label.clearFilters')}
                                variant="outlined"
                                onClick={() => handleFiltersChange({})}
                            />
                        )}
                    </section>
                )}

                {!loading && !error && hasResults && (
                    <section className={styles.card} aria-labelledby="snr-results-heading">
                        <div className={styles.resultsHeader}>
                            <Typography component="h2" variant="heading" id="snr-results-heading">
                                {displayedResultCount === 1 ?
                                    t('label.oneResult') :
                                    t('label.resultCount', {count: displayedResultCount})}
                            </Typography>
                            <div className={styles.chips}>
                                {searchResults?.truncated && (
                                    <Chip label={t('label.resultsTruncated')} color="warning"/>
                                )}
                                {selectedNodes.length > 0 && (
                                    <Chip label={t('label.selected', {count: selectedNodes.length})} color="accent"/>
                                )}
                            </div>
                        </div>
                        <ResultsTable
                            nodes={filteredNodes}
                            selectedLanguage={selectedLanguage}
                            siteKey={siteKey}
                            searchTerm={currentSearchTerm}
                            selectedNodes={selectedNodes}
                            onSelectionChange={setSelectedNodes}
                        />
                    </section>
                )}

                {replaceModalOpen && (
                    <ReplaceModal
                        isOpen={replaceModalOpen}
                        selectedLanguage={selectedLanguage}
                        siteKey={siteKey}
                        selectedNodes={selectedNodes}
                        selectedNodeData={filteredNodes.filter(node => selectedNodes.includes(node.uuid))}
                        searchTerm={currentSearchTerm}
                        onClose={() => setReplaceModalOpen(false)}
                        onReplaceComplete={handleReplaceComplete}
                    />
                )}
            </div>
        </LayoutContent>
    );
};

SearchAndReplace.propTypes = {
    siteKey: PropTypes.string.isRequired
};

export default SearchAndReplace;
