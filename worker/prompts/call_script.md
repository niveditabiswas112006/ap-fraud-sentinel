# Verification Call Script — template

This is the script the Bland-AI / TTS lane reads when calling a vendor's
`known_phone` to verify a bank-account-change request. The template fields
in `{{ double-braces }}` are substituted by `worker/call.py:build_call_script`
before TTS synthesis.

## Template

Hello, this is the AP Payment desk at Acme Industries calling on a recorded
line. May I speak with the accounts payable contact for {{ vendor_legal_name }}?

This call is to verify a bank-account change request received for invoice
{{ invoice_number }} in the amount of {{ amount_usd }}.

Our records show that on {{ bank_change_request_date }}, a request was
received to update the bank account on file for {{ vendor_legal_name }} to a
new account ending {{ requested_bank_account_last4 }}.

Can you confirm whether {{ vendor_legal_name }} authorized this bank-account
change? Please answer yes or no, and state your name and title for the
record.

If you did not request this change, please say "no, we did not request this
change." If you did request it, please confirm the new account number on file
and your name.

Thank you. This recording will be attached to case {{ case_id }} for
audit-trail purposes.
