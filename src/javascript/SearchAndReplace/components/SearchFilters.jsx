import React, {useState, useCallback, useEffect, useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {useQuery} from '@apollo/client';
import {
    Typography,
    Input,
    Button,
    Dropdown
} from '@jahia/moonstone';
import {Close} from '@jahia/moonstone';
import PropTypes from 'prop-types';
import {GET_SITE_NODE_TYPES_QUERY} from '../SearchAndReplace.gql-queries';
import styles from '../SearchAndReplace.scss';

/**
 * Search Filters Component
 * Provides advanced filtering options for search results
 */
export const SearchFilters = ({availableNodeTypes, filters, onFiltersChange, selectedLanguage, siteKey}) => {
    const {t, i18n} = useTranslation('search-and-replace');
    const [localFilters, setLocalFilters] = useState(filters);
    const currentLanguage = (i18n?.language || 'en').split('-')[0];

    const {data: nodeTypesData, loading: nodeTypesLoading} = useQuery(GET_SITE_NODE_TYPES_QUERY, {
        variables: {
            siteKey,
            language: selectedLanguage || currentLanguage
        },
        skip: !siteKey,
        fetchPolicy: 'cache-first'
    });

    useEffect(() => {
        setLocalFilters(filters);
    }, [filters]);

    const nodeTypeOptions = useMemo(() => {
        const rawNodes = nodeTypesData?.jcr?.nodeTypes?.nodes || [];
        let options = rawNodes
            .filter(nodeType => nodeType && nodeType.name)
            .map(nodeType => ({
                value: nodeType.name,
                label: nodeType.displayName || nodeType.name
            }))
            .sort((a, b) => a.label.localeCompare(b.label));

        if (Array.isArray(availableNodeTypes) && availableNodeTypes.length > 0) {
            const allowedTypes = new Set(availableNodeTypes);
            options = options.filter(option => allowedTypes.has(option.value));
        }

        if (localFilters.nodeType && !options.some(option => option.value === localFilters.nodeType)) {
            options = [{
                value: localFilters.nodeType,
                label: localFilters.nodeType
            }, ...options];
        }

        return options;
    }, [availableNodeTypes, localFilters.nodeType, nodeTypesData]);
    const nodeTypeDropdownData = useMemo(() => {
        const defaultOption = {
            label: nodeTypesLoading ? t('label.loadingNodeTypes') : t('label.allNodeTypes'),
            value: ''
        };
        return [defaultOption, ...nodeTypeOptions];
    }, [nodeTypeOptions, nodeTypesLoading, t]);

    // Handle filter change
    const handleFilterChange = useCallback((key, value) => {
        setLocalFilters(prev => ({
            ...prev,
            [key]: value
        }));
    }, []);

    // Apply filters
    const handleApply = useCallback(() => {
        onFiltersChange(localFilters);
    }, [localFilters, onFiltersChange]);

    // Clear all filters
    const handleClearAll = useCallback(() => {
        setLocalFilters({});
        onFiltersChange({});
    }, [onFiltersChange]);

    const hasActiveFilters = Object.keys(localFilters).some(key => localFilters[key]);

    return (
        <div className={styles.searchFiltersPanel}>
            <div className={styles.filtersHeader}>
                <Typography component="h2" variant="subheading" weight="bold">
                    {t('label.advancedFilters')}
                </Typography>
                {hasActiveFilters && (
                    <Button
                        label={t('label.clearAllFilters')}
                        icon={<Close/>}
                        variant="ghost"
                        size="small"
                        onClick={handleClearAll}
                    />
                )}
            </div>

            <div className={styles.filtersGrid}>
                {/* Node Type Filter */}
                <div className={styles.filterItem}>
                    <Typography variant="caption" weight="bold">
                        {t('label.contentType')}
                    </Typography>
                    <Dropdown
                        className={`${styles.filterDropdown} ${styles.filterDropdownBottomAligned}`}
                        data={nodeTypeDropdownData}
                        value={localFilters.nodeType || ''}
                        variant="outlined"
                        size="medium"
                        onChange={(event, item) => handleFilterChange('nodeType', item?.value || '')}
                    />
                </div>

                {/* Date Filters */}
                <div className={styles.filterItem}>
                    <Typography variant="caption" weight="bold">
                        {t('label.createdDate')}
                    </Typography>
                    <div className={styles.dateRangeInputs}>
                        <div className={styles.dateField}>
                            <Typography variant="caption">{t('label.startDate')}</Typography>
                            <Input
                                type="date"
                                placeholder={t('label.from')}
                                value={localFilters.createdAfter || ''}
                                onChange={e => handleFilterChange('createdAfter', e.target.value)}
                            />
                        </div>
                        <div className={styles.dateField}>
                            <Typography variant="caption">{t('label.endDate')}</Typography>
                            <Input
                                type="date"
                                placeholder={t('label.to')}
                                value={localFilters.createdBefore || ''}
                                onChange={e => handleFilterChange('createdBefore', e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <div className={styles.filterItem}>
                    <Typography variant="caption" weight="bold">
                        {t('label.modifiedDate')}
                    </Typography>
                    <div className={styles.dateRangeInputs}>
                        <div className={styles.dateField}>
                            <Typography variant="caption">{t('label.startDate')}</Typography>
                            <Input
                                type="date"
                                placeholder={t('label.from')}
                                value={localFilters.modifiedAfter || ''}
                                onChange={e => handleFilterChange('modifiedAfter', e.target.value)}
                            />
                        </div>
                        <div className={styles.dateField}>
                            <Typography variant="caption">{t('label.endDate')}</Typography>
                            <Input
                                type="date"
                                placeholder={t('label.to')}
                                value={localFilters.modifiedBefore || ''}
                                onChange={e => handleFilterChange('modifiedBefore', e.target.value)}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className={styles.filtersActions}>
                <Button
                    label={t('label.applyFilters')}
                    color="accent"
                    onClick={handleApply}
                />
            </div>
        </div>
    );
};

SearchFilters.propTypes = {
    availableNodeTypes: PropTypes.array,
    filters: PropTypes.object.isRequired,
    onFiltersChange: PropTypes.func.isRequired,
    selectedLanguage: PropTypes.string,
    siteKey: PropTypes.string
};

export default SearchFilters;
