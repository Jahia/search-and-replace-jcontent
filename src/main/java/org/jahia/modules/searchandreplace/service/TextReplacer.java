package org.jahia.modules.searchandreplace.service;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Replaces a term in a text value. Plain text is replaced as a whole; rich text is split into markup
 * and text, and only the text between tags is replaced, so attributes (links, image sources, classes),
 * comments and the content of {@code script} and {@code style} elements are never changed.
 * Stateless and thread-safe.
 */
public final class TextReplacer {

    /**
     * How the term is matched.
     */
    public enum Mode {
        /** The exact characters of the term. */
        EXACT_MATCH,
        /** The term, ignoring case. */
        CASE_INSENSITIVE,
        /** The term is a Java regular expression; the replacement may use group references. */
        REGEX
    }

    private static final Pattern MARKUP = Pattern.compile("<!--.*?-->|<[^>]*>", Pattern.DOTALL);
    private static final Pattern RAW_TEXT_OPENING = Pattern.compile("^<(script|style)\\b", Pattern.CASE_INSENSITIVE);

    private TextReplacer() {
    }

    /**
     * Replaces every occurrence of the term in the value.
     *
     * @param value       the current value, may be {@code null}
     * @param term        the term to find; an empty term changes nothing
     * @param replacement the replacement, {@code null} is an empty string
     * @param mode        how the term is matched
     * @param kind        whether the value is plain text or rich text
     * @return the new value, equal to {@code value} when nothing matched
     */
    public static String replace(String value, String term, String replacement, Mode mode, TextFields.Kind kind) {
        if (value == null || term == null || term.isEmpty()) {
            return value;
        }
        String safeReplacement = replacement == null ? "" : replacement;
        if (kind != TextFields.Kind.HTML) {
            return replaceText(value, term, safeReplacement, mode);
        }

        // In HTML text, '&', '<' and '>' are written as entities: match and insert them the same way.
        String htmlTerm = mode == Mode.REGEX ? term : escapeText(term);
        String htmlReplacement = mode == Mode.REGEX ? safeReplacement : escapeText(safeReplacement);

        StringBuilder result = new StringBuilder(value.length());
        Matcher markup = MARKUP.matcher(value);
        int cursor = 0;
        String rawTextElement = null;
        while (markup.find()) {
            String text = value.substring(cursor, markup.start());
            result.append(rawTextElement == null ? replaceText(text, htmlTerm, htmlReplacement, mode) : text);
            String tag = markup.group();
            result.append(tag);
            rawTextElement = nextRawTextElement(rawTextElement, tag);
            cursor = markup.end();
        }
        String tail = value.substring(cursor);
        result.append(rawTextElement == null ? replaceText(tail, htmlTerm, htmlReplacement, mode) : tail);
        return result.toString();
    }

    private static String nextRawTextElement(String current, String tag) {
        if (current != null) {
            return tag.toLowerCase(Locale.ROOT).startsWith("</" + current) ? null : current;
        }
        Matcher opening = RAW_TEXT_OPENING.matcher(tag);
        return opening.find() && !tag.endsWith("/>") ? opening.group(1).toLowerCase(Locale.ROOT) : null;
    }

    private static String replaceText(String text, String term, String replacement, Mode mode) {
        if (text.isEmpty()) {
            return text;
        }
        switch (mode == null ? Mode.CASE_INSENSITIVE : mode) {
            case REGEX:
                return text.replaceAll(term, replacement);
            case EXACT_MATCH:
                return text.replace(term, replacement);
            case CASE_INSENSITIVE:
            default:
                return Pattern.compile(Pattern.quote(term), Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE)
                        .matcher(text)
                        .replaceAll(Matcher.quoteReplacement(replacement));
        }
    }

    private static String escapeText(String text) {
        return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
