import React, {useState, useCallback, useMemo, useEffect} from 'react';
import {useTranslation} from 'react-i18next';
import {useQuery} from '@apollo/client';
import {
    Header,
    Typography,
    Input,
    Dropdown,
    Button,
    Chip,
    Loader
} from '@jahia/moonstone';
import PropTypes from 'prop-types';
import {GET_SITE_LANGUAGES_QUERY, SEARCH_NODES_QUERY} from './SearchAndReplace.gql-queries';
import {SearchFilters} from './components/SearchFilters';
import {ResultsTable} from './components/ResultsTable';
import {ReplaceModal} from './components/ReplaceModal';
import styles from './SearchAndReplace.scss';

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
    const [searchExecuted, setSearchExecuted] = useState(false);
    const [selectedLanguage, setSelectedLanguage] = useState((i18n?.language || 'en').split('-')[0]);

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
            filters: Object.keys(normalizedFilters).length > 0 ? normalizedFilters : null
        },
        skip: !currentSearchTerm || currentSearchTerm.trim() === '',
        fetchPolicy: 'network-only'
    });

    // Search handler
    const handleSearch = useCallback(() => {
        if (searchTerm.trim()) {
            setCurrentSearchTerm(searchTerm);
            setSearchExecuted(true);
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
        setSearchExecuted(false);
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

    return (
        <div className={styles.layout}>
            <Header
                title={t('label.title', {siteInfo: siteKey})}
                mainActions={[
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
                        onClick={() => setShowFilters(!showFilters)}
                    />,
                    selectedNodes.length > 0 && (
                        <Button
                            key="replace"
                            label={t('label.replaceInNodes', {count: selectedNodes.length})}
                            color="accent"
                            size="big"
                            onClick={handleReplace}
                        />
                    )
                ].filter(Boolean)}
            />
            <div className={styles.container}>

                {/* Hero Search Section */}
                <div className={styles.searchHero}>
                    <div className={styles.searchHeroContent}>
                        {!currentSearchTerm && (
                            <>
                                <Typography variant="heading" weight="bold" className={styles.searchHeroTitle}>
                                    {t('label.heroTitle')}
                                </Typography>
                                <Typography variant="body" className={styles.searchHeroDescription}>
                                    {t('label.heroDescription')}
                                </Typography>
                            </>
                        )}
                        <div className={styles.searchBar}>
                            <Input
                                autoFocus
                                className={styles.searchInput}
                                placeholder={t('label.searchPlaceholder')}
                                value={searchTerm}
                                size="big"
                                onChange={e => setSearchTerm(e.target.value)}
                                onKeyPress={handleKeyPress}
                            />
                            <Dropdown
                                className={styles.searchLanguageDropdown}
                                data={languageDropdownData}
                                value={selectedLanguage}
                                size="medium"
                                variant="outlined"
                                onChange={(event, item) => {
                                    if (item?.value) {
                                        setSelectedLanguage(item.value);
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
                        {currentSearchTerm && (
                            <div className={styles.searchInfoBar}>
                                <Chip
                                    label={t('label.searchingFor', {term: currentSearchTerm})}
                                    color="default"
                                />
                                <Chip
                                    label={t('label.searchLanguage', {language: getLanguageLabel(selectedLanguage)})}
                                    color="default"
                                />
                                {activeFilterCount > 0 && (
                                    <Chip
                                        label={t('label.activeFilters', {count: activeFilterCount})}
                                        color="accent"
                                    />
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Filters Panel */}
                {showFilters && (
                    <SearchFilters
                        availableNodeTypes={availableNodeTypes}
                        filters={normalizedFilters}
                        selectedLanguage={selectedLanguage}
                        siteKey={siteKey}
                        onFiltersChange={handleFiltersChange}
                    />
                )}

                {/* Results Section */}
                <div className={styles.resultsSection}>
                    {loading && (
                        <div className={styles.loadingState}>
                            <Loader size="big"/>
                            <Typography variant="subheading" className={styles.loadingText}>
                                {t('label.searching')}
                            </Typography>
                            <Typography variant="caption" color="default">
                                {t('label.searchingDescription')}
                            </Typography>
                        </div>
                    )}

                    {error && (
                        <div className={styles.errorState}>
                            <Typography variant="heading" color="danger" className={styles.errorTitle}>
                                {t('label.errorTitle')}
                            </Typography>
                            <Typography variant="body" color="danger">
                                {error.message}
                            </Typography>
                        </div>
                    )}

                    {!loading && !error && searchExecuted && !currentSearchTerm && (
                        <div className={styles.emptyState}>
                            <Typography variant="heading" className={styles.emptyStateTitle}>
                                {t('label.emptyStateTitle')}
                            </Typography>
                            <Typography variant="body" color="default">
                                {t('label.emptyStateDescription')}
                            </Typography>
                        </div>
                    )}

                    {!loading && !error && currentSearchTerm && !hasResults && (
                        <div className={styles.emptyState}>
                            <Typography variant="heading" className={styles.emptyStateTitle}>
                                {t('label.noResultsTitle')}
                            </Typography>
                            <Typography variant="body" color="default">
                                {t('label.noResultsDescription', {term: currentSearchTerm})}
                            </Typography>
                            {activeFilterCount > 0 && (
                                <Button
                                    label={t('label.clearFilters')}
                                    variant="outlined"
                                    className={styles.emptyStateAction}
                                    onClick={() => handleFiltersChange({})}
                                />
                            )}
                        </div>
                    )}

                    {!loading && !error && hasResults && (
                        <div className={styles.resultsContainer}>
                            {/* Results Summary Card */}
                            <div className={styles.resultsSummaryCard}>
                                <div className={styles.resultsSummaryContent}>
                                    <div className={styles.resultsSummaryStats}>
                                        <Typography variant="heading" className={styles.resultsCount}>
                                            {displayedResultCount}
                                        </Typography>
                                        <Typography variant="body" className={styles.resultsLabel}>
                                            {t('label.matchesFound')}
                                        </Typography>
                                    </div>
                                    <div className={styles.resultsSummaryInfo}>
                                        <Chip
                                            label={`${t('label.searchTerm')}: "${currentSearchTerm}"`}
                                            color="default"
                                        />
                                        {searchResults?.truncated && (
                                            <Chip
                                                label={t('label.resultsTruncated')}
                                                color="warning"
                                            />
                                        )}
                                        {selectedNodes.length > 0 && (
                                            <Chip
                                                label={t('label.selected', {count: selectedNodes.length})}
                                                color="accent"
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Results Table */}
                            <ResultsTable
                                nodes={filteredNodes}
                                selectedLanguage={selectedLanguage}
                                siteKey={siteKey}
                                searchTerm={currentSearchTerm}
                                selectedNodes={selectedNodes}
                                onSelectionChange={setSelectedNodes}
                            />
                        </div>
                    )}
                </div>

                {/* Replace Modal */}
                {replaceModalOpen && (
                    <ReplaceModal
                        isOpen={replaceModalOpen}
                        selectedLanguage={selectedLanguage}
                        siteKey={siteKey}
                        selectedNodes={selectedNodes}
                        searchTerm={currentSearchTerm}
                        onClose={() => setReplaceModalOpen(false)}
                        onReplaceComplete={handleReplaceComplete}
                    />
                )}
            </div>
        </div>
    );
};

SearchAndReplace.propTypes = {
    siteKey: PropTypes.string.isRequired
};

export default SearchAndReplace;
