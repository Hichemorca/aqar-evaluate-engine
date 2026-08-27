# MIAYAAR Administrator Guide

## Calibration Console

**Version:** Administrator Guide — 27 August 2026

**Interface:** [MIAYAAR Calibration Console](https://aqar-valuation-engine.netlify.app/admin-calibration)

> **This guide is for the single calibration administrator.** The console changes settings that affect new valuations immediately after saving. Do not use it for unreviewed experiments, and do not change a production value before testing and documenting the reason for the change.

## 1. Purpose of the console

The **Calibration Console** allows the administrator to review and edit valuation-method weights and property-type calibration factors. Each saved configuration receives its own `configId`, and new valuations retain the identity of the calibration version they used. Historical valuations are not automatically recalculated when a new calibration version is created.

The console is English-only. This guide uses the same section and field names shown in the interface.

## 2. Core security rules

| Rule | Required action |
|---|---|
| Admin token secrecy | Enter the token only in the password field. Never place it in README files, Git, command lines, screenshots, browser logs, or support tickets. |
| Single administrator | Do not share the token. If exposure is suspected, rotate it in Netlify settings and test authentication again. |
| No production experiments | Use an isolated local test or a documented comparison before saving any production change. |
| Do not change unexplained values | Do not modify DCF, fallback, GIS, or Shadow factors unless the reason, scope, and test evidence are documented. |
| Do not use invented evidence | Do not create a factor from a guess or from one unverified property result. |
| Saving is immediate | **Save and activate** creates an active version immediately. The current console has no Draft or Preview stage. |

This guide contains no Admin token and never requires one to be shared. The token must remain outside documentation, commits, and public messages.

## 3. Signing in

Open the [Calibration Console](https://aqar-valuation-engine.netlify.app/admin-calibration). Enter the Admin token in **Administrator token**, then select **Load configuration**. Do not use a test value or an old token on the live site.

When authentication succeeds, the console displays **Configuration loaded. Changes are editable below.** The top status changes to **Connected** and shows the active `configId`. If authentication or the request fails, the status remains **Not connected** and the configuration is not available for editing.

| Status | Meaning |
|---|---|
| **Not connected** | Authentication has not completed or the request failed. The configuration is not editable. |
| **Authenticating…** | The token is being checked. Wait for the request to finish. |
| **Connected · configId** | The active configuration has loaded and can be reviewed or edited. |
| **Saving…** | A new version is being saved. Keep the page open until the result is shown. |
| **Active · configId** | The new version was saved and activated for new valuations. |

Never store the token in a shared project file, commit, issue, screenshot, or browser trace.

## 4. Reading the console

After loading, the main area shows **Active calibration** and the right sidebar shows **Save directly** and **Version history**.

| Area | Purpose |
|---|---|
| **Active calibration** | Shows the active `configId`, update date, and current settings. |
| Property-type cards | One card for Apartment, Villa, Townhouse, Office, Retail / Shop, Warehouse, and Land. |
| **Save directly** | Shows changed-value count, weight validity, and Save and Reload actions. |
| **Version history** | Shows recent saved versions with `configId`, date, and administrator identity. |
| **Reload active** | Reloads the active server version and discards unsaved local edits. |

Only one property-type card is open at a time. Select a property type to open it and select another type to move to its settings.

## 5. Property-type cards

Each card contains only the settings for that property type. Its header shows the applicable valuation methods and their total weight. Non-applicable methods are not rendered inside the type.

| Property type | Current interactive methods |
|---|---|
| Apartment | Sales Comparison, Income, DCF |
| Villa | Sales Comparison, Income, Cost, DCF |
| Townhouse | Sales Comparison, Income, Cost, DCF |
| Office | Sales Comparison, Income, Cost, DCF |
| Retail / Shop | Sales Comparison, Income, Cost, DCF |
| Warehouse | Sales Comparison, Income, Cost |
| Land | Sales Comparison, Income |

If a method field is absent for a property type, this is intentional: the method is not currently applicable to that type and its weight should not be added manually.

## 6. Valuation Methods

This section contains the **method weights** applicable to the selected property type. Values are displayed as percentages, such as `55%`, while they are stored internally as decimal weights, such as `0.55`.

### Weight-total rule

The total of the applicable method weights for every property type must equal **100%** within the validation tolerance enforced by the server. Non-applicable method weights must remain zero and are excluded from the displayed total.

| Display | Required action |
|---|---|
| Total is `100.0%` in the normal color | The weight rule is valid. Review the complete change before saving. |
| Total is below or above `100.0%` in red | Saving is blocked until the applicable method weights are corrected. |
| **Save blocked: total must equal 100%** | Adjust the weights until the total is 100%, then review all other changes. |
| A non-applicable method is being added | Stop. Do not add it to the configuration manually. |

Change weights in a balanced way. For example, if the Sales Comparison weight for Apartment increases, reduce Income or DCF by the appropriate amount so that the total remains 100%.

## 7. Valuation Factors

This section groups calibration factors by the user-facing field shown in the public evaluation form instead of presenting one unstructured technical list. Each field card contains only the factors associated with that field. A card can contain more than one method group when the field affects more than one applicable approach.

| Field card | Examples of included controls |
|---|---|
| **Total Area (sqm)** | Max Price Per Sqm and area-related Cost Approach factors. |
| **Bedrooms** | No Bedroom Multiplier. |
| **Features & Amenities** | Feature Bonus Per Sqm. |
| **Year Built** | Age Depreciation, Minimum Age Multiplier, and Cost depreciation factors. |
| **Condition** | Condition factors for Sales Comparison and Cost when applicable. |
| **Finish Quality** | Finish-level factors. |
| **View Type** | View factors and View multiplier bounds. |
| **Floor Level** | Floor-category factors. |
| **Street Position** | Main, Corner, Secondary, and Quiet factors. |
| **Building Condition** | Building-condition factors. |
| **Furnished Status** | Furnished, Semi-Furnished, and Unfurnished factors. |
| **Annual Rent (AED)** | Vacancy Rate Percent and Cap Rate Percent. |
| **Annual Expenses (AED)** | Expense Rate. |

A factor appearing inside a field card means that it belongs to that calibration path. It does not mean that the public user will always provide the input or that the path will operate when market evidence or required inputs are missing.

## 8. Advanced Calibration

**Advanced Calibration** contains additional controls that do not map directly to one visible public field. The largest group is **DCF**, including:

| Group | Examples |
|---|---|
| DCF projection | Years, Rent Growth Rate, Value Growth Rate, Net Operating Income Rate. |
| DCF terminal and discount | Terminal Value Rate, Discount Rate. |
| DCF fallback | Negative NPV Fallback, Fallback Cap Rate. |
| Additional method controls | Other internal controls for an applicable method. |

Do not change these values merely to improve one result. A change should be preceded by an isolated local test, a comparison across more than one property type and sample or time window, and documentation of expected and unexpected effects. If the purpose of a factor is unclear, leave it unchanged and request a methodology review.

## 9. Experimental Shadow Controls

For some property types, this section contains the experimental v2.1 factors:

| Field card | Current purpose |
|---|---|
| **Project / Building Name** | A Shadow multiplier for a project or building when sufficient DLD evidence exists. |
| **BUA / Plot Area** | Shadow multiplier bands for the BUA-to-Plot-Area ratio. |
| **Last Renovation Year** | Shadow multiplier bands for the age since the last renovation. |
| **Shadow Settings** | Shadow enablement, minimum project evidence, and combined multiplier bounds. |

These factors **do not replace the official value** while Shadow is disabled, and they must not be enabled in production merely for experimentation. The neutral value is `1.00×`, and the default activation state is disabled.

A manually typed project name is not automatically verified. Add a Project multiplier only after a verified DLD suggestion and the required evidence threshold are available. Do not rename Total Area or `area` as BUA or Plot Area, and do not invent values for fields that the source does not provide.

## 10. Shared Location & Facilities settings

At the end of the console, **Location & Facilities** contains shared GIS settings, including facility-type weights, search radius, impact cap, distance decay, and lower and upper proximity-multiplier bounds.

These settings affect the location and facilities path and may depend on an external GIS service. Do not change them because of one map result or a temporary facilities-fetch failure. Any change requires coverage and impact testing, with confirmation that missing GIS data does not create an artificial premium.

## 11. Safe workflow for changing a value

Start by recording the active version and the reason for the proposed change. Identify the property type and the field or factor to be reviewed. Test the change first in an isolated local environment using in-memory values, without an Admin token, production POST, or modification of official artifacts. Change one value, or one clearly related group, and retain the baseline and modified results.

After the test succeeds, open the correct property-type card on the live console and modify only the intended field. Check every weight total, then review **Save directly**. Select **Save and activate** only when the values are understood, every property-type total is valid, and the change is documented.

After saving, record the new `configId` and activation date. Run a new valuation with a known test case and confirm that it uses the intended version. Do not expect historical values to change automatically; they retain the calibration identity used when they were created.

## 12. Saving and reloading

**Save and activate** saves the complete configuration and makes it active immediately for new valuations. The current console has no separate Preview or Draft action. Treat this button as a production action.

**Reload active** loads the active server configuration. Use it to discard unsaved local edits or confirm that the page shows the latest version. Reloading discards local changes that have not been saved.

If a saved value later proves unsuitable, do not edit or delete history manually. Create a corrected version after testing and review, then document the reason and both affected configuration versions.

## 13. Version history

**Version history** shows recent saved versions with their `configId`, date, and administrator identity. Use it for traceability, but do not treat its display as a substitute for a formal rollback or change-review plan.

For every change, the internal record should include the previous version, new version, property type, field or factor, old value, new value, reason, test results, and activation scope. Never place the Admin token in that record.

## 14. Troubleshooting

| Message or situation | Action |
|---|---|
| **Enter the administrator token first.** | Enter the token only in the designated field and check for accidental spaces. |
| **Request failed** or **Not connected** | Do not retry Save. Check access and connectivity, then reload when appropriate. |
| **Save blocked: total must equal 100%** | Review applicable method weights for every property type and restore each total to 100%. |
| A field or method is not displayed | Check the property type; it may be intentionally non-applicable. |
| An unfamiliar value appears | Stop editing, reload the active version, and review the factor source before saving. |
| A new valuation changes after saving | Confirm the new `configId`, and distinguish new valuations from historical results. |

## 15. Pre-save checklist

| Question | Required answer |
|---|---|
| Is the change specific and understood? | Yes, with a written reason. |
| Was it tested locally or in an isolated experiment? | Yes, without a token or production POST. |
| Does every property type total 100%? | Yes, with normal-color summaries. |
| Were non-applicable methods left untouched? | Yes. |
| Were unrelated official values and artifacts preserved? | Yes. |
| Is the impact limited to new valuations as intended? | Yes. |
| Was the new version recorded after saving? | It must be recorded immediately. |

## 16. Administrator responsibility and boundaries

The calibration administrator must not raise or lower a property value manually to match a preferred result. The console manages documented, testable factors; it is not a tool for editing individual valuation outcomes. Official Accuracy and DLD artifacts are protected and must not be changed manually to justify a new factor.

MIAYAAR remains a controlled pilot platform. Any methodological change to valuation approaches, fallback behavior, or Shadow activation requires an independent decision, comparative testing, and explicit approval before adoption.

## References

[1]: https://aqar-valuation-engine.netlify.app/admin-calibration "MIAYAAR Calibration Console"

[2]: https://github.com/Hichemorca/aqar-evaluate-engine/blob/main/calibration.html "Calibration Console source"

[3]: https://github.com/Hichemorca/aqar-evaluate-engine/blob/main/shared/calibration-validation.js "Calibration validation rules"

[4]: https://github.com/Hichemorca/aqar-evaluate-engine/blob/main/shared/aqar-calibration-defaults.js "Calibration defaults and method applicability"

[5]: https://github.com/Hichemorca/aqar-evaluate-engine/blob/main/docs/calibration-impact-matrix-review-2026-08-27.md "Local calibration impact matrix review"
