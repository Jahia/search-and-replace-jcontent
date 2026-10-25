package org.jahia.modules.searchandreplace.service;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

public class TextReplacerTest {

    private static String html(String value, String term, String replacement) {
        return TextReplacer.replace(value, term, replacement, TextReplacer.Mode.CASE_INSENSITIVE, TextFields.Kind.HTML);
    }

    private static String plain(String value, String term, String replacement, TextReplacer.Mode mode) {
        return TextReplacer.replace(value, term, replacement, mode, TextFields.Kind.PLAIN);
    }

    @Test
    public void richTextKeepsAttributesAndReplacesText() {
        assertEquals("<p>Globex sells <a href=\"https://acme.example/acme\" title=\"acme\">Globex tools</a></p>",
                html("<p>Acme sells <a href=\"https://acme.example/acme\" title=\"acme\">Acme tools</a></p>", "acme", "Globex"));
    }

    @Test
    public void richTextLeavesCommentsScriptsAndStylesAlone() {
        assertEquals("<!-- acme --><script>var acme = 1;</script><style>.acme{}</style><p>Globex</p>",
                html("<!-- acme --><script>var acme = 1;</script><style>.acme{}</style><p>Acme</p>", "acme", "Globex"));
    }

    @Test
    public void richTextEscapesTheReplacementAndMatchesEscapedTerms() {
        assertEquals("<p>Tom &amp; Jerry &lt;b&gt;</p>", html("<p>Tom and Jerry &lt;b&gt;</p>", "and", "&"));
        assertEquals("<p>Tom or Jerry</p>", html("<p>Tom &amp; Jerry</p>", "&", "or"));
        assertEquals("<p>&lt;script&gt;</p>", html("<p>x</p>", "x", "<script>"));
    }

    @Test
    public void richTextWithoutMarkupIsText() {
        assertEquals("Globex", html("acme", "acme", "Globex"));
    }

    @Test
    public void plainModes() {
        assertEquals("Globex and Globex", plain("Acme and acme", "acme", "Globex", TextReplacer.Mode.CASE_INSENSITIVE));
        assertEquals("Acme and Globex", plain("Acme and acme", "acme", "Globex", TextReplacer.Mode.EXACT_MATCH));
        assertEquals("w1-w2", plain("v1-v2", "v(\\d)", "w$1", TextReplacer.Mode.REGEX));
        assertEquals("cost $5", plain("cost X", "x", "$5", TextReplacer.Mode.CASE_INSENSITIVE));
    }

    @Test(expected = TextReplacer.RegexTimeoutException.class, timeout = 5000)
    public void catastrophicRegexStopsAtTheDeadline() {
        // A backreference disables the JDK's loop memoization: about 30 s on JDK 11 without the deadline
        String value = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!";
        TextReplacer.replace(value, "(a+)+\\1b", "x", TextReplacer.Mode.REGEX, TextFields.Kind.PLAIN, 100);
    }

    @Test
    public void regexWithinTheDeadlineReplaces() {
        assertEquals("x-x", TextReplacer.replace("a1-a2", "a\\d", "x", TextReplacer.Mode.REGEX, TextFields.Kind.PLAIN, 100));
    }

    @Test
    public void nothingToReplace() {
        assertNull(plain(null, "a", "b", TextReplacer.Mode.CASE_INSENSITIVE));
        assertEquals("abc", plain("abc", "", "x", TextReplacer.Mode.CASE_INSENSITIVE));
        assertEquals("ac", plain("abc", "b", null, TextReplacer.Mode.CASE_INSENSITIVE));
    }
}
