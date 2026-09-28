-- Re-Charge — a business with no website of its own simply needs "A website".
--
-- Earlier prospect-finder imports stored pitches like "new website + WhatsApp
-- booking". For prospects with no website (or only a Facebook / Instagram
-- page) marked High / Very high, the pitch becomes plain "A website". Leads
-- already talking to you (Enquired onwards) are left as they are.

update projects
   set potential_note = 'A website'
 where status in ('prospect', 'contacted')
   and potential in ('high', 'very_high')
   and (website is null or website ~* '(^|[./])(facebook\.com|fb\.com|instagram\.com)')
   and potential_note is distinct from 'A website';
