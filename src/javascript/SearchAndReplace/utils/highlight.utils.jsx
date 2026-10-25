import React from 'react';
import DOMPurify from 'dompurify';

export const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const isHtmlContent = value => {
    if (!value || typeof value !== 'string') {
        return false;
    }

    return /<\/?[a-z][\s\S]*>/i.test(value);
};

/**
 * Allowlist for HTML that comes from the repository (an editor's rich text) and is shown in the panel:
 * formatting tags only, no attribute except the class of the highlight, so no link, image, style, form
 * or URL of any scheme survives. Links show as text.
 */
export const PREVIEW_HTML_CONFIG = {
    ALLOWED_TAGS: [
        'p',
        'br',
        'strong',
        'b',
        'em',
        'i',
        'u',
        's',
        'sub',
        'sup',
        'span',
        'div',
        'a',
        'ul',
        'ol',
        'li',
        'blockquote',
        'code',
        'pre',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'table',
        'thead',
        'tbody',
        'tr',
        'th',
        'td',
        'mark'
    ],
    ALLOWED_ATTR: ['class'],
    ALLOW_DATA_ATTR: false
};

/** Sanitizes HTML with the allowlist above; call it on what reaches dangerouslySetInnerHTML. */
export const sanitizePreviewHtml = html => DOMPurify.sanitize(html || '', PREVIEW_HTML_CONFIG);

/**
 * Sanitizes rich text with the allowlist, then wraps each occurrence of the term in its text nodes
 * in a mark element. The caller sanitizes the result again where it renders it.
 */
export const sanitizeAndHighlightHtml = (rawHtml, term, highlightClassName) => {
    if (!rawHtml || typeof window === 'undefined') {
        return '';
    }

    const parser = new window.DOMParser();
    const doc = parser.parseFromString(sanitizePreviewHtml(rawHtml), 'text/html');

    const normalizedTerm = (term || '').trim();
    if (!normalizedTerm) {
        return doc.body.innerHTML;
    }

    const searchTermLower = normalizedTerm.toLowerCase();
    const textNodes = [];
    const walker = doc.createTreeWalker(doc.body, window.NodeFilter.SHOW_TEXT);

    let currentNode = walker.nextNode();
    while (currentNode) {
        textNodes.push(currentNode);
        currentNode = walker.nextNode();
    }

    textNodes.forEach(textNode => {
        const textContent = textNode.nodeValue || '';
        const lowerText = textContent.toLowerCase();
        if (!lowerText.includes(searchTermLower)) {
            return;
        }

        const fragment = doc.createDocumentFragment();
        let cursor = 0;
        let matchIndex = lowerText.indexOf(searchTermLower, cursor);

        while (matchIndex !== -1) {
            if (matchIndex > cursor) {
                fragment.appendChild(doc.createTextNode(textContent.slice(cursor, matchIndex)));
            }

            const matchedText = textContent.slice(matchIndex, matchIndex + normalizedTerm.length);
            const markElement = doc.createElement('mark');
            markElement.className = highlightClassName;
            markElement.textContent = matchedText;
            fragment.appendChild(markElement);

            cursor = matchIndex + normalizedTerm.length;
            matchIndex = lowerText.indexOf(searchTermLower, cursor);
        }

        if (cursor < textContent.length) {
            fragment.appendChild(doc.createTextNode(textContent.slice(cursor)));
        }

        if (textNode.parentNode) {
            textNode.parentNode.replaceChild(fragment, textNode);
        }
    });

    return doc.body.innerHTML;
};

export const renderHighlightedText = (text, term, highlightClassName, keyPrefix = 'highlight') => {
    if (!text || !term) {
        return text;
    }

    const regex = new RegExp(`(${escapeRegExp(term)})`, 'gi');
    const parts = text.split(regex);

    return (
        <span>
            {/* eslint-disable react/no-array-index-key */}
            {parts.map((part, index) =>
                part.toLowerCase() === term.toLowerCase() ?
                    <mark key={`${keyPrefix}-${index}`} className={highlightClassName}>{part}</mark> :
                    <span key={`text-${keyPrefix}-${index}`}>{part}</span>
            )}
            {/* eslint-enable react/no-array-index-key */}
        </span>
    );
};
