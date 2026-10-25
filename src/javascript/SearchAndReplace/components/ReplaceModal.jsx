import React, {useState, useCallback, useEffect} from 'react';
import {useTranslation} from 'react-i18next';
import {useMutation, useQuery} from '@apollo/client';
import {
    Button,
    Input,
    Typography,
    CheckboxItem,
    Chip,
    Loader
} from '@jahia/moonstone';
import PropTypes from 'prop-types';
import {REPLACE_IN_NODES_MUTATION, SEARCH_NODES_QUERY} from '../SearchAndReplace.gql-queries';
import styles from '../SearchAndReplace.scss';
import {escapeRegExp, isHtmlContent, renderHighlightedText, sanitizeAndHighlightHtml} from '../utils/highlight.utils';

const Dialog = ({isOpen, className, onClose, children}) => (
    isOpen ? (
        <div
            className={styles.modalOverlay}
            role="presentation"
            onClick={event => {
                if (event.target === event.currentTarget && onClose) {
                    onClose();
                }
            }}
        >
            <div className={`${styles.replaceModal} ${className || ''}`} role="dialog" aria-modal="true">
                {children}
            </div>
        </div>
    ) : null
);
Dialog.propTypes = {
    isOpen: PropTypes.bool,
    className: PropTypes.string,
    onClose: PropTypes.func,
    children: PropTypes.node
};

const DialogTitle = ({children}) => (
    <div className={styles.modalHeader}>
        <Typography variant="heading" weight="bold">
            {children}
        </Typography>
    </div>
);
DialogTitle.propTypes = {
    children: PropTypes.node
};

const DialogContent = ({children}) => (
    <div className={styles.modalBody}>{children}</div>
);
DialogContent.propTypes = {
    children: PropTypes.node
};

const DialogContentText = ({children}) => (
    <div>{children}</div>
);
DialogContentText.propTypes = {
    children: PropTypes.node
};

const DialogActions = ({children}) => (
    <div className={styles.modalFooter}>{children}</div>
);
DialogActions.propTypes = {
    children: PropTypes.node
};

/**
 * Replace Modal Component
 * Handles the replacement operation with preview and progress
 */
export const ReplaceModal = ({isOpen, onClose, siteKey, selectedLanguage, selectedNodes, searchTerm, onReplaceComplete}) => {
    const {t} = useTranslation('search-and-replace');
    const [replacementTerm, setReplacementTerm] = useState('');
    const [selectedProperties, setSelectedProperties] = useState(new Set());
    const [selectAllProps, setSelectAllProps] = useState(true);
    const [step, setStep] = useState('input'); // Input, preview, progress, complete
    const [replaceResult, setReplaceResult] = useState(null);

    // Get node details for preview
    const {data: previewData, loading: previewLoading} = useQuery(SEARCH_NODES_QUERY, {
        variables: {
            termToSearch: searchTerm,
            siteKey,
            language: selectedLanguage,
            filters: null
        },
        skip: !isOpen,
        fetchPolicy: 'network-only'
    });

    // Replace mutation
    const [replaceInNodes] = useMutation(REPLACE_IN_NODES_MUTATION, {
        onCompleted: data => {
            setReplaceResult(data.searchAndReplace.replaceInNodes);
            setStep('complete');
        },
        onError: error => {
            console.error('Replace error:', error);
            setReplaceResult({
                successfulNodes: [],
                failedNodes: selectedNodes,
                totalPropertiesUpdated: 0,
                errors: [{message: error.message}]
            });
            setStep('complete');
        }
    });

    // Get nodes data for preview
    const nodesData = Array.isArray(previewData?.searchAndReplace?.searchNodes?.nodes) ?
        previewData.searchAndReplace.searchNodes.nodes.filter(node => node && node.uuid && selectedNodes.includes(node.uuid)) :
        [];

    // Collect all unique properties
    const allProperties = React.useMemo(() => {
        const propsMap = new Map();
        nodesData.forEach(node => {
            (node.matchingProperties || []).filter(prop => prop && prop.name).forEach(prop => {
                if (prop.replaceable) {
                    if (!propsMap.has(prop.name)) {
                        propsMap.set(prop.name, prop.label || prop.name);
                    }
                }
            });
        });
        return Array.from(propsMap.entries()).map(([name, label]) => ({name, label}));
    }, [nodesData]);

    // Initialize selected properties
    useEffect(() => {
        if (selectAllProps) {
            setSelectedProperties(new Set(allProperties.map(property => property.name)));
        }
    }, [allProperties, selectAllProps]);

    // Handle property selection
    const handlePropertyToggle = useCallback((propName, checked) => {
        setSelectedProperties(prev => {
            const newSet = new Set(prev);
            if (checked) {
                newSet.add(propName);
            } else {
                newSet.delete(propName);
                setSelectAllProps(false);
            }

            return newSet;
        });
    }, []);

    // Handle select all properties
    const handleSelectAllProps = useCallback(checked => {
        setSelectAllProps(checked);
        if (checked) {
            setSelectedProperties(new Set(allProperties.map(property => property.name)));
        } else {
            setSelectedProperties(new Set());
        }
    }, [allProperties]);

    // Execute replace
    const handleExecuteReplace = useCallback(() => {
        setStep('progress');
        replaceInNodes({
            variables: {
                siteKey,
                nodeUuids: selectedNodes,
                termToReplace: searchTerm,
                replacementTerm,
                language: selectedLanguage,
                propertiesToReplace: Array.from(selectedProperties),
                searchMode: 'CASE_INSENSITIVE'
            }
        });
    }, [siteKey, selectedNodes, searchTerm, replacementTerm, selectedLanguage, selectedProperties, replaceInNodes]);

    // Preview replacement
    const getPreviewText = useCallback((value, term, replacement) => {
        if (!value || !term) {
            return value;
        }

        return value.replace(new RegExp(escapeRegExp(term), 'g'), () => replacement);
    }, []);

    const renderPreviewValue = useCallback((value, highlightTerm, valueClassName) => {
        if (isHtmlContent(value)) {
            return (
                <div
                    /* eslint-disable-next-line react/no-danger */
                    dangerouslySetInnerHTML={{__html: sanitizeAndHighlightHtml(value, highlightTerm, styles.highlight)}}
                    className={`${valueClassName} ${styles.modalPreviewHtml}`}
                />
            );
        }

        return (
            <Typography variant="body" className={valueClassName}>
                {renderHighlightedText(value, highlightTerm, styles.highlight, 'preview')}
            </Typography>
        );
    }, []);

    // Complete and close
    const handleComplete = useCallback(() => {
        onReplaceComplete();
        onClose();
    }, [onReplaceComplete, onClose]);

    // Render based on step
    const renderContent = () => {
        switch (step) {
            case 'input':
                return (
                    <>
                        <DialogContent>
                            <DialogContentText>
                                <Typography variant="body">
                                    {t('label.replaceDescription', {
                                        count: selectedNodes.length,
                                        term: searchTerm
                                    })}
                                </Typography>
                            </DialogContentText>

                            <div className={styles.modalReplaceInputSection}>
                                <Typography variant="caption" weight="bold">
                                    {t('label.searchTerm')}
                                </Typography>
                                <Input
                                    disabled
                                    value={searchTerm}
                                    className={styles.modalReplaceInput}
                                />

                                <Typography variant="caption" weight="bold">
                                    {t('label.replacementTerm')}
                                </Typography>
                                <Input
                                    autoFocus
                                    value={replacementTerm}
                                    placeholder={t('label.enterReplacementTerm')}
                                    className={styles.modalReplaceInput}
                                    onChange={e => setReplacementTerm(e.target.value)}
                                />
                            </div>

                            {previewLoading ? (
                                <Loader/>
                            ) : (
                                <div className={styles.modalPropertiesSelection}>
                                    <div className={styles.modalPropertiesHeader}>
                                        <Typography variant="subheading" weight="bold">
                                            {t('label.selectPropertiesToReplace')}
                                        </Typography>
                                        <CheckboxItem
                                            id="replace-all-properties"
                                            value="__all__"
                                            label={t('label.selectAll')}
                                            checked={selectAllProps}
                                            onChange={(event, value, checked) => handleSelectAllProps(checked)}
                                        />
                                    </div>
                                    <div className={styles.modalPropertiesList}>
                                        {allProperties.map(property => (
                                            <CheckboxItem
                                                key={property.name}
                                                id={`replace-property-${property.name}`}
                                                value={property.name}
                                                label={property.label}
                                                checked={selectedProperties.has(property.name)}
                                                isDisabled={selectAllProps}
                                                onChange={(event, value, checked) => handlePropertyToggle(value, checked)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </DialogContent>
                        <DialogActions>
                            <Button
                                label={t('label.cancel')}
                                variant="outlined"
                                onClick={onClose}
                            />
                            <Button
                                label={t('label.preview')}
                                color="accent"
                                isDisabled={!replacementTerm.trim() || selectedProperties.size === 0}
                                onClick={() => setStep('preview')}
                            />
                        </DialogActions>
                    </>
                );

            case 'preview':
                return (
                    <>
                        <DialogContent>
                            <DialogContentText>
                                <Typography variant="body">
                                    {t('label.previewDescription')}
                                </Typography>
                            </DialogContentText>

                            <div className={styles.modalPreviewSection}>
                                {nodesData.slice(0, 3).map(node => (
                                    <div key={node.uuid} className={styles.modalPreviewNode}>
                                        <Typography variant="subheading" weight="bold">
                                            {node.displayName || node.name}
                                        </Typography>
                                        {(node.matchingProperties || [])
                                            .filter(prop => prop && prop.name && prop.replaceable && (selectAllProps || selectedProperties.has(prop.name)))
                                            .map(prop => (
                                                <div key={`${node.uuid}-${prop.name}`} className={styles.modalPreviewProperty}>
                                                    <Typography variant="caption" weight="bold">
                                                        {prop.label || prop.name}
                                                    </Typography>
                                                    <div className={styles.modalPreviewValues}>
                                                        <div className={styles.modalPreviewValueItem}>
                                                            <Chip label={t('label.before')} size="small"/>
                                                            {renderPreviewValue(prop.value, searchTerm, styles.modalOldValue)}
                                                        </div>
                                                        <div className={styles.modalPreviewValueItem}>
                                                            <Chip label={t('label.after')} size="small" color="accent"/>
                                                            {renderPreviewValue(
                                                                getPreviewText(prop.value, searchTerm, replacementTerm),
                                                                replacementTerm || searchTerm,
                                                                styles.modalNewValue
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                ))}
                                {nodesData.length > 3 && (
                                    <Typography variant="caption">
                                        {t('label.andMoreNodes', {count: nodesData.length - 3})}
                                    </Typography>
                                )}
                            </div>
                        </DialogContent>
                        <DialogActions>
                            <Button
                                label={t('label.back')}
                                variant="outlined"
                                onClick={() => setStep('input')}
                            />
                            <Button
                                label={t('label.executeReplace')}
                                color="accent"
                                onClick={handleExecuteReplace}
                            />
                        </DialogActions>
                    </>
                );

            case 'progress':
                return (
                    <>
                        <DialogContent>
                            <div className={styles.modalProgressSection}>
                                <Loader size="big"/>
                                <Typography variant="body">
                                    {t('label.replacingInProgress')}
                                </Typography>
                                <Loader size="small" className={styles.modalProgressBar}/>
                            </div>
                        </DialogContent>
                    </>
                );

            case 'complete': {
                const failedNodes = replaceResult?.failedNodes || [];
                const successfulNodes = replaceResult?.successfulNodes || [];
                const errors = replaceResult?.errors || [];
                const hasErrors = failedNodes.length > 0;
                const allSuccess = successfulNodes.length === selectedNodes.length;

                return (
                    <>
                        <DialogContent>
                            <div className={styles.modalCompleteSection}>
                                {allSuccess ? (
                                    <>
                                        <Typography variant="heading" color="success">
                                            {t('label.replaceSuccess')}
                                        </Typography>
                                    </>
                                ) : hasErrors ? (
                                    <>
                                        <Typography variant="heading" color="warning">
                                            {t('label.replacePartialSuccess')}
                                        </Typography>
                                    </>
                                ) : (
                                    <>
                                        <Typography variant="heading" color="danger">
                                            {t('label.replaceError')}
                                        </Typography>
                                    </>
                                )}

                                <div className={styles.modalResultSummary}>
                                    <Chip
                                        label={`${successfulNodes.length} ${t('label.successful')}`}
                                        color="success"
                                    />
                                    <Chip
                                        label={`${replaceResult?.totalPropertiesUpdated || 0} ${t('label.propertiesUpdated')}`}
                                        color="accent"
                                    />
                                    {hasErrors && (
                                        <Chip
                                            label={`${failedNodes.length} ${t('label.failed')}`}
                                            color="danger"
                                        />
                                    )}
                                </div>

                                {hasErrors && errors.length > 0 && (
                                    <div className={styles.modalErrorList}>
                                        <Typography variant="subheading" weight="bold">
                                            {t('label.errors')}
                                        </Typography>
                                        {errors.map((err, errIdx) => (
                                            /* eslint-disable-next-line react/no-array-index-key */
                                            <Typography key={`error-${errIdx}`} variant="caption" color="danger">
                                                {err.nodePath || err.nodeUuid}: {err.message}
                                            </Typography>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </DialogContent>
                        <DialogActions>
                            <Button
                                label={t('label.close')}
                                color="accent"
                                onClick={handleComplete}
                            />
                        </DialogActions>
                    </>
                );
            }

            default:
                return null;
        }
    };

    const dialogTitle = (
        (step === 'input' && t('label.replaceTitle')) ||
        (step === 'preview' && t('label.previewTitle')) ||
        (step === 'progress' && t('label.replacingTitle')) ||
        (step === 'complete' && t('label.completeTitle')) ||
        ''
    );

    return (
        <Dialog
            isOpen={isOpen}
            className={styles.replaceModal}
            onClose={step === 'progress' ? undefined : onClose}
        >
            <DialogTitle>
                {dialogTitle}
            </DialogTitle>
            {renderContent()}
        </Dialog>
    );
};

ReplaceModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    siteKey: PropTypes.string.isRequired,
    selectedLanguage: PropTypes.string.isRequired,
    selectedNodes: PropTypes.array.isRequired,
    searchTerm: PropTypes.string.isRequired,
    onReplaceComplete: PropTypes.func.isRequired
};

export default ReplaceModal;
