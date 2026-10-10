package domain

import (
	"bytes"
	nethtml "golang.org/x/net/html"
	"golang.org/x/net/html/atom"
	"html"
	"strings"
)

// Responses are untrusted. No URLs, images, styles, forms, embedded content,
// event handlers or arbitrary attributes survive, including stored responses.
func SanitizeResponseHTML(raw string) string {
	if len(raw) > 64*1024 {
		return "<p>The response exceeded the allowed size. Please ask a more specific question.</p>"
	}
	context := &nethtml.Node{Type: nethtml.ElementNode, Data: "body", DataAtom: atom.Body}
	nodes, err := nethtml.ParseFragment(strings.NewReader(raw), context)
	if err != nil {
		return "<p>" + html.EscapeString(raw) + "</p>"
	}
	allowed := map[string]bool{"p": true, "br": true, "strong": true, "b": true, "em": true, "i": true, "u": true, "div": true, "span": true, "table": true, "thead": true, "tbody": true, "tfoot": true, "tr": true, "th": true, "td": true, "ul": true, "ol": true, "li": true, "h2": true, "h3": true, "h4": true, "blockquote": true, "code": true, "pre": true, "hr": true}
	blocked := map[string]bool{"script": true, "style": true, "svg": true, "math": true, "iframe": true, "object": true, "embed": true, "form": true, "template": true, "noscript": true}
	classes := map[string]bool{"ai-stat-card": true, "stat-label": true, "ai-restriction-box": true, "ai-error": true}
	var out bytes.Buffer
	var render func(*nethtml.Node)
	render = func(n *nethtml.Node) {
		if n.Type == nethtml.TextNode {
			out.WriteString(html.EscapeString(n.Data))
			return
		}
		if n.Type != nethtml.ElementNode {
			return
		}
		if blocked[n.Data] {
			return
		}
		if allowed[n.Data] {
			out.WriteString("<" + n.Data)
			for _, a := range n.Attr {
				if a.Key == "class" && a.Namespace == "" {
					safe := []string{}
					for _, c := range strings.Fields(a.Val) {
						if classes[c] {
							safe = append(safe, c)
						}
					}
					if len(safe) > 0 {
						out.WriteString(` class="` + strings.Join(safe, " ") + `"`)
					}
				}
			}
			out.WriteString(">")
		}
		for child := n.FirstChild; child != nil; child = child.NextSibling {
			render(child)
		}
		if allowed[n.Data] && n.Data != "br" && n.Data != "hr" {
			out.WriteString("</" + n.Data + ">")
		}
	}
	for _, n := range nodes {
		render(n)
	}
	if strings.TrimSpace(out.String()) == "" {
		return "<p>No displayable response was returned.</p>"
	}
	return out.String()
}
