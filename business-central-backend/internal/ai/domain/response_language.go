package domain

import "unicode"

// ResponseLanguageInstruction is shared by the planner and answer formatter.
// Language choice never derives from merchant currency or database field names.
func ResponseLanguageInstruction(question string) string {
	instruction := "RESPONSE LANGUAGE: Reply in the language of the latest user question. Use that language for all explanations, greetings, metric labels, table headings, and follow-up suggestions. Previous answers, English instructions/examples, database field names, and currency codes must not change the response language. Preserve currency codes, numbers, SKUs and proper names. Never translate tool names, dataset identifiers or query fields."
	if IsMyanmarQuestion(question) {
		instruction += " The latest question is predominantly Myanmar (Burmese): write the user-facing response in Myanmar, including financial labels such as စုစုပေါင်းရောင်းရငွေ, စုစုပေါင်းကုန်ကျစရိတ်, and စုစုပေါင်းအကြမ်းအမြတ်. Keep MMK and other currency codes unchanged."
	}
	return instruction
}

// IsMyanmarQuestion recognizes predominantly Myanmar-script questions, including
// mixed questions with English financial terms, without relying on shop locale.
func IsMyanmarQuestion(question string) bool {
	myanmar, other := 0, 0
	for _, r := range question {
		if !unicode.IsLetter(r) {
			continue
		}
		if r >= 0x1000 && r <= 0x109f || r >= 0xa9e0 && r <= 0xa9ff || r >= 0xaa60 && r <= 0xaa7f {
			myanmar++
		} else {
			other++
		}
	}
	return myanmar > 0 && myanmar >= other
}
