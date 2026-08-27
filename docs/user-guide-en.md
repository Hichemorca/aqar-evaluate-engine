# MIAYAAR User Guide

## Valuation Intelligence Engine

**Version:** User Guide — 27 August 2026

**Platform:** [aqar-valuation-engine.netlify.app](https://aqar-valuation-engine.netlify.app/)

> **Important notice:** MIAYAAR is currently intended for controlled pilot and limited use. The displayed value is an **indicative estimate**, not an official valuation report. It does not replace a review by a licensed property valuer, especially for financing, collateral, legal, investment, or major transaction decisions.

## 1. What does MIAYAAR do?

MIAYAAR helps users obtain an indicative estimate for a Dubai property using the property information entered by the user, available market transaction data for the selected area, usable comparable sales, and location and nearby-facility data when available. The platform does not guarantee sufficient evidence for every area or property type and does not invent a market price when the available evidence is insufficient.

The current user interface is English-only. This guide uses the same English field names displayed in the platform.

## 2. Quick start

| Step | Action |
|---:|---|
| 1 | Open the [MIAYAAR platform](https://aqar-valuation-engine.netlify.app/). |
| 2 | Select **Property Type** and enter **Total Area (sqm)**. The area must be at least 10 square metres. |
| 3 | Complete the optional fields that apply to the property. Leave unknown fields blank. |
| 4 | Type a **District / Area** and choose a suggestion from the list. |
| 5 | Review the map marker and drag it to a more accurate position when the exact location is known. |
| 6 | Select **Load market data** to retrieve available comparables for the selected area and property type. |
| 7 | Review the comparable count, evidence status, and nearby facilities shown on the map. |
| 8 | Enter **Annual Rent (AED)** when known, then select **Calculate Valuation**. |
| 9 | Read the value, confidence percentage, evidence state, and **Why this valuation?** section before using the result. |
| 10 | Select **Reset** to begin a new valuation. |

## 3. Property type and core details

### Property Type

Choose one of the available types: **Apartment, Villa, Townhouse, Office, Retail / Shop, Warehouse, or Land**. The selected type determines which fields are displayed and which valuation approaches can be used.

### Total Area (sqm)

Enter the total property area in square metres. This is required for the valuation flow and must be at least 10 square metres. Use the area that represents the property being valued. Do not automatically use BUA or Plot Area as a replacement when those measurements are different.

### Bedrooms

This field appears when it is relevant to the selected property type. Select the number of bedrooms or **Studio** where there are no separate bedrooms. If the field is not displayed, the current interface does not use it for that property type.

### Year Built and Condition

Enter **Year Built** when known and select the closest option under **Condition**. These inputs can adjust the estimate when the applicable valuation approach uses them.

## 4. Optional property details

Some fields appear only for relevant property types. Do not enter an estimated value merely to complete the form; leave a field blank when the information is unknown.

| Field | When it appears | How to use it |
|---|---|---|
| **Features & Amenities** | Depending on property type | Select amenities that actually exist, such as Pool, Parking, Security, Elevator, or Central AC. |
| **Finish Quality** | Depending on property type | Select the closest finish level: Luxury, Good, Normal, Basic, or Poor. |
| **View Type** | Depending on property type | Select the applicable view. Multiple normal view types may be selected; Unknown and Internal / No View indicate that no usable view is available. |
| **Floor Level** | For property types that use floor information | Select the closest floor band or leave it as Unknown. |
| **Street Position** | For property types that use street position | Select Main Street, Secondary Street, Quiet Street, or Corner Plot. |
| **Building Condition** | Depending on property type | Describe the general condition of the building, not only the interior condition of the unit. |
| **Furnished Status** | Depending on property type | Select Fully Furnished, Semi-Furnished, or Unfurnished, and use Unknown when unclear. |

## 5. Additional property details

The **Additional Property Details** section contains optional fields that appear according to the selected property type.

| Field | Current property types |
|---|---|
| **Project / Building Name** | Apartment, Villa, Townhouse |
| **BUA (Built-up Area, sqm)** | Villa, Townhouse |
| **Plot Area (sqm)** | Villa, Townhouse, Land |
| **Last Renovation Year** | Apartment, Villa, Townhouse when the property is more than five years old |

Enter BUA and Plot Area from reliable documents or verified information. Do not automatically treat Total Area as a substitute for either value. A project name typed manually is not automatically verified. For stronger matching, select a project suggestion when one is available.

## 6. District / Area and the map

Type the area name into **District / Area** and select a suggestion from the list. Selecting a district places the marker at a representative point for that area and establishes the centre for the nearby-facilities search.

You can drag the marker or click another position on the map when the exact location is known. MIAYAAR attempts to match the point to a nearby area in its data list. If no reliable match is available, the district name may be cleared rather than assigning a distant or incorrect district.

The numeric latitude and longitude fields do not need to be entered manually and are hidden from the normal user interface. District points are representative locations, not official legal boundaries, so review the marker position yourself.

## 7. Nearby Facilities

After a location is selected, MIAYAAR attempts to retrieve nearby facilities within the search circle around the marker, including **Metro, Supermarket, School, Hospital, Park, Gym / Fitness Center, Cafe, and Restaurant**. When data is available, the map shows the facilities and the interface displays **Location impact on valuation** as a percentage derived from the available facility data.

If the GIS source is unavailable or no matching facilities are found, the interface displays an unavailable or no-results state. The absence of displayed facilities does not prove that the property has no nearby facilities; it may only mean that the external data source returned no usable result.

## 8. Loading market data

Select **Load market data** after selecting the area and entering the property area. When the request succeeds, the interface displays values such as **Price / sqm**, **Comparables**, and an evidence status.

| Displayed state | Practical meaning |
|---|---|
| **Ready** | Usable evidence is available. Continue while reviewing the displayed details. |
| **Limited** | Comparables are available, but the sample is small. Review the sample carefully before relying on the estimate. |
| **Insufficient** | There is not enough sales evidence to support a reliable Sales Comparison result. The platform does not create an invented DLD-based price. |
| **Unavailable** | The data source or service could not be reached temporarily. |

A valuation may still be possible when **Annual Rent (AED)** is provided even if comparable sales are unavailable, through the Income Approach with the evidence limitation made clear.

## 9. Rental and cost inputs

### Annual Rent (AED)

Enter the annual rent when it is known and relates to the property being valued. A positive value allows the **Income Approach** to be used and may also allow DCF for property types that support it.

### Annual Expenses (AED)

Enter annual expenses when they are known. If the field is blank, the platform may use an internal assumption based on a percentage of rent. This assumption is not a source fact about the property.

### Land Value and Build Cost/sqm (AED)

The **Cost Approach** fields appear for property types that use this approach in the current interface. Enter Land Value or Build Cost/sqm only when you have a reliable value. If they are blank, the platform may use the current calibration assumptions and reflect their effect in the result explanation or assumptions.

## 10. Calculating and reading the result

Select **Calculate Valuation** after entering the core information. When a valuation is possible, the result card can include the following elements:

| Element | Meaning |
|---|---|
| **Estimated Market Value** | The indicative value produced from the entered inputs and available evidence. |
| **Confidence** | An approximate strength indicator based on evidence and the number of usable valuation approaches; it is not a guarantee of accuracy. |
| **Evidence state** | Shows whether market evidence is ready, limited, insufficient, or unavailable. |
| **Why this valuation?** | A simplified summary of comparable count, evidence strength, selected inputs, and market context when available. |
| **New Valuation** | Hides the current result and allows a new valuation to be started. |

A final value may not be displayed when no applicable approach can be used or when the available evidence is insufficient. In that case, MIAYAAR displays an evidence state and asks the user to review the inputs instead of inventing a price.

## 11. Optional data sharing

After a valuation, the platform may display **Help improve MIAYAAR by sharing this property input and valuation result for anonymous analysis**. Sharing is completely optional and does not affect the calculated value.

If the consent box is not selected, no observation is submitted. If consent is given, the valuation inputs and result may be submitted for anonymous analysis subject to server-side validation. User-entered property information should not be treated as verified market truth. Do not enter a name, email address, telephone number, token, or other secret into the form.

## 12. Starting a new valuation and resetting

Use **New Valuation** on the result card to hide the current result and return to the form, or use **Reset** to clear the inputs and start again. After changing the property or district, reload market data before relying on a new result, and confirm that the comparables belong to the correct property type and area.

## 13. Additional pages

| Page | Use |
|---|---|
| [Accuracy](https://aqar-valuation-engine.netlify.app/accuracy-dashboard.html) | View official Accuracy indicators and diagnostic summaries. |
| [Market Intelligence](https://aqar-valuation-engine.netlify.app/market-intelligence.html) | View available market-information indicators together with their context and limitations. |
| [Decision Engine](https://aqar-decision-engine.netlify.app/) | Send valuation context to the separate decision-support tool when needed. |

**Admin Login** is intended for the platform administrator and is not part of normal customer use.

## 14. Best practices

Use factual property information whenever possible, and do not confuse Total Area with BUA or Plot Area. Select a District / Area suggestion rather than entering an uncertain area name, and review the map marker manually when location accuracy matters. Check the comparable count and evidence state before interpreting the result. Treat Limited or Insufficient evidence as a reason for additional human review, not as a reason to increase confidence.

Do not use the estimate alone to make a financing, purchase, sale, collateral, guarantee, or legal decision. For a formal decision, obtain a licensed valuation review together with the relevant property documents and current market evidence.

## References

[1]: https://aqar-valuation-engine.netlify.app/ "MIAYAAR live valuation platform"

[2]: https://github.com/Hichemorca/aqar-evaluate-engine "MIAYAAR source repository and current behavior documentation"

[3]: https://aqar-valuation-engine.netlify.app/accuracy-dashboard.html "MIAYAAR Accuracy dashboard"

[4]: https://aqar-valuation-engine.netlify.app/market-intelligence.html "MIAYAAR Market Intelligence"

[5]: https://www.openstreetmap.org/ "OpenStreetMap"
