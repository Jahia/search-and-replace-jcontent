import React, {useState, useCallback, useEffect} from 'react';
import {useTranslation} from 'react-i18next';
import {useLazyQuery, useMutation} from '@apollo/client';
import {
    Button,
    Input,
    Typography,
    CheckboxItem,
    Chip,
    Loader,
    Modal,
    ModalBody,
    ModalFooter,
    ModalHeader
} from '@jahia/moonstone';
import PropTypes from 'prop-types';
import {PREVIEW_REPLACE_QUERY, REPLACE_IN_NODES_MUTATION} from '../SearchAndReplace.gql-queries';
import styles from '../SearchAndReplace.scss';
import {isHtmlContent, renderHighlightedText, sanitizeAndHighlightHtml} from '../utils/highlight.utils';

// Body and footer of the Moonstone Modal; the modal itself gives the title, Escape, focus and the portal.
const DialogContent = ({children}) => <ModalBody>{children}</ModalBody>;
DialogContent.propTypes = {
    children: PropTypes.node
};

const DialogContentText = ({children}) => <div>{children}</div>;
DialogContentText.propTypes = {
    children: PropTypes.node
};

const DialogActions = ({children}) => <ModalFooter>{children}</ModalFooter>;
DialogActions.propTypes = {
    children: PropTypes.node
};

/**
 * Replace Modal Component
 * Handles the replacement operation with preview and progress
 */
export const ReplaceModal = ({isOpen, onClose, siteKey, selectedLanguage, selectedNodes, selectedNodeData, searchTerm, onReplaceComplete}) => {
    const {t} = useTranslation('search-and-replace');
    const [replacementTerm, setReplacementTerm] = useState('');
    const [selectedProperties, setSelectedProperties] = useState(new Set());
    const [selectAllProps, setSelectAllProps] = useState(true);
    const [step, setStep] = useState('input'); // Input, preview, progress, complete
    const [replaceResult, setReplaceResult] = useState(null);

    // The server computes the preview with the same rules as the replacement
    const [loadPreview, {data: previewResult, loading: previewLoading, error: previewError}] = useLazyQuery(PREVIEW_REPLACE_QUERY, {
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

    // The selected rows, as the search returned them
    const nodesData = React.useMemo(() => (selectedNodeData || []).filter(node => node && node.uuid), [selectedNodeData]);
    const previews = previewResult?.searchAndReplace?.previewReplace || [];
    const hasChanges = previews.some(preview => (preview.propertyPreviews || []).length > 0);

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

    // Matches the replacement never changes, listed apart and never selectable
    const readOnlyMatches = React.useMemo(() => nodesData.flatMap(node => (node.matchingProperties || [])
        .filter(prop => prop && prop.name && !prop.replaceable)
        .map(prop => ({
            key: `${node.uuid}-${prop.label}`,
            node: node.displayName || node.name,
            label: prop.label || prop.name,
            reason: prop.notReplaceableReason === 'DIFFERENT_SPELLING' ?
                'label.reasonDifferentSpelling' :
                'label.reasonNotATextField'
        }))), [nodesData]);

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

    const handlePreview = useCallback(() => {
        loadPreview({
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
        setStep('preview');
    }, [loadPreview, siteKey, selectedNodes, searchTerm, replacementTerm, selectedLanguage, selectedProperties]);

    const nodeLabel = useCallback(preview => {
        const node = nodesData.find(item => item.uuid === preview.nodeUuid);
        return node?.displayName || node?.name || preview.nodePath || preview.nodeUuid;
    }, [nodesData]);

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

    // Render based on step: one branch per step of the dialog
    // eslint-disable-next-line complexity
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
                            {readOnlyMatches.length > 0 && (
                                <div className={styles.modalReadOnly} role="group" aria-labelledby="snr-not-updated-heading">
                                    <Typography variant="subheading" weight="bold" id="snr-not-updated-heading">
                                        {t('label.notUpdatedHeading', {count: readOnlyMatches.length})}
                                    </Typography>
                                    <Typography variant="caption">{t('label.notUpdatedDescription')}</Typography>
                                    <ul className={styles.modalReadOnlyList}>
                                        {readOnlyMatches.map(item => (
                                            <li key={item.key}>
                                                <Typography variant="caption">
                                                    <strong>{item.label}</strong>{' - '}{item.node}{' - '}<em>{t(item.reason)}</em>
                                                </Typography>
                                            </li>
                                        ))}
                                    </ul>
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
                                onClick={handlePreview}
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
                                {previewLoading && <Loader/>}
                                {previewError && (
                                    <Typography variant="body" color="danger">{previewError.message}</Typography>
                                )}
                                {!previewLoading && !previewError && !hasChanges && (
                                    <Typography variant="body">{t('label.previewNothing')}</Typography>
                                )}
                                {!previewLoading && previews
                                    .filter(preview => preview.error || (preview.propertyPreviews || []).length > 0)
                                    .map(preview => (
                                        <div key={preview.nodeUuid} className={styles.modalPreviewNode}>
                                            <Typography variant="subheading" weight="bold">
                                                {nodeLabel(preview)}
                                            </Typography>
                                            {preview.error && (
                                                <Typography variant="caption" color="danger">{preview.error}</Typography>
                                            )}
                                            {(preview.propertyPreviews || []).map(prop => (
                                                <div key={`${preview.nodeUuid}-${prop.label}`} className={styles.modalPreviewProperty}>
                                                    <Typography variant="caption" weight="bold">
                                                        {prop.label || prop.name}
                                                    </Typography>
                                                    <div className={styles.modalPreviewValues}>
                                                        <div className={styles.modalPreviewValueItem}>
                                                            <Chip label={t('label.before')} size="small"/>
                                                            {renderPreviewValue(prop.currentValue, searchTerm, styles.modalOldValue)}
                                                        </div>
                                                        <div className={styles.modalPreviewValueItem}>
                                                            <Chip label={t('label.after')} size="small" color="accent"/>
                                                            {renderPreviewValue(prop.newValue, replacementTerm || searchTerm, styles.modalNewValue)}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
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
                                isDisabled={previewLoading || !hasChanges}
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
                const unchangedNodes = replaceResult?.unchangedNodes || [];
                const errors = replaceResult?.errors || [];
                const hasErrors = failedNodes.length > 0;
                const allSuccess = !hasErrors && successfulNodes.length > 0;
                let headline = {label: t('label.replaceNothing'), color: 'default'};
                if (allSuccess) {
                    headline = {label: t('label.replaceSuccess'), color: 'success'};
                } else if (hasErrors && successfulNodes.length > 0) {
                    headline = {label: t('label.replacePartialSuccess'), color: 'warning'};
                } else if (hasErrors) {
                    headline = {label: t('label.replaceError'), color: 'danger'};
                }

                return (
                    <>
                        <DialogContent>
                            <div className={styles.modalCompleteSection}>
                                <Typography variant="heading" color={headline.color}>
                                    {headline.label}
                                </Typography>

                                <div className={styles.modalResultSummary}>
                                    <Chip
                                        label={`${successfulNodes.length} ${t('label.successful')}`}
                                        color="success"
                                    />
                                    <Chip
                                        label={`${replaceResult?.totalPropertiesUpdated || 0} ${t('label.propertiesUpdated')}`}
                                        color="accent"
                                    />
                                    {unchangedNodes.length > 0 && (
                                        <Chip
                                            label={`${unchangedNodes.length} ${t('label.unchanged')}`}
                                            color="default"
                                        />
                                    )}
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
        <Modal
            isOpen={isOpen}
            size="large"
            className={styles.replaceModal}
            onOpenChange={open => {
                // A running replacement cannot be dismissed
                if (!open && step !== 'progress') {
                    onClose();
                }
            }}
        >
            <div className={styles.modalShell}>
                <ModalHeader title={dialogTitle}/>
                {renderContent()}
            </div>
        </Modal>
    );
};

ReplaceModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    siteKey: PropTypes.string.isRequired,
    selectedLanguage: PropTypes.string.isRequired,
    selectedNodes: PropTypes.array.isRequired,
    selectedNodeData: PropTypes.array,
    searchTerm: PropTypes.string.isRequired,
    onReplaceComplete: PropTypes.func.isRequired
};

export default ReplaceModal;
