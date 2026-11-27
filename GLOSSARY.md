# Postcode History

A static website that takes a Northern Ireland **Postcode** and shows the history of the surrounding area: an **Area Summary**, **Heritage Records** nearby, a **Timeline**, **Nearby Articles** and, when available, **Historical Maps**.

## Places

**Postcode**:
A full Northern Ireland postcode (starting `BT`), such as `BT7 1NN`, used to find a **Search Centre**.
_Avoid_: Zip, address

**Postcode District**:
The outward part of a **Postcode** on its own, such as `BT7`, whose centre is used as the **Search Centre**.
_Avoid_: Outcode, area code

**Terminated Postcode**:
A **Postcode** that Royal Mail no longer uses but whose last known location is still known.
_Avoid_: Old postcode, expired postcode

**Search Centre**:
The point that a lookup measures distances from: the location of a **Postcode** or the centre of a **Postcode District**.
_Avoid_: Origin, location

**Search Area**:
Everything within 1 km of the **Search Centre**.
_Avoid_: Radius, neighbourhood, nearby area

**Townland**:
The small, historic land division that the **Search Centre** lies in, such as Malone Lower. Northern Ireland has about 9,600 of them.
_Avoid_: Area, neighbourhood, district

**Place Name**:
A named place (a **Townland**, settlement, street or landmark) with its Irish or other original form and meaning, as recorded by the Northern Ireland Place-Name Project.
_Avoid_: Placename, toponym, etymology

**Area Summary**:
The overview of a **Search Area**: the nearest settlement's Wikipedia introduction, the **Townland** and its **Place Name**, other **Place Names** nearby, and counts of what the other sections hold.
_Avoid_: Overview (as a noun for the content; "Overview" is only the tab's label), profile

## Heritage

**Heritage Record**:
One entry in a Department for Communities historic environment dataset, describing a single monument, building, industrial feature or designed landscape.
_Avoid_: Site, listing, monument (as a general term), feature

**Record Type**:
Which dataset a **Heritage Record** comes from: **Monument**, **Historic Building**, **Industrial Heritage** or **Historic Park/Garden**.
_Avoid_: Category, layer, dataset (in the user interface)

**Monument**:
A **Heritage Record** from the Sites and Monuments Record: an archaeological site or historic monument.
_Avoid_: SMR site, archaeological site

**Historic Building**:
A **Heritage Record** from the Historic Buildings Record. It may or may not be legally listed; listing is shown as its grade.
_Avoid_: Listed building (unless it is graded), HB

**Industrial Heritage**:
A **Heritage Record** from the Industrial Heritage Record, such as a mill, bridge, kiln or railway structure.
_Avoid_: IHR, industrial site

**Historic Park/Garden**:
A **Heritage Record** from the register of Historic Parks, Gardens and Demesnes. Unlike the other **Record Types**, it covers an area, not a point.
_Avoid_: Demesne (on its own), park

**Era**:
A named period that a **Monument** belongs to (Neolithic, Early Christian, 17th century…), or the date range a **Historic Building** was built in. Used to group **Heritage Records** on the **Timeline**.
_Avoid_: Age, epoch, date (for a period)

## Timeline

**Timeline**:
Everything dated near the **Search Centre**, oldest first: **Timeline Events** and **Heritage Records** grouped by **Era**.
_Avoid_: History (as a section name), news

**Timeline Event**:
A dated place or happening near the **Search Centre** from Wikidata: when something was founded, opened or closed, or when an event (a battle, a bombing, an opening) took place.
_Avoid_: News, news event, story

## Maps and articles

**Historical Map**:
One edition of the OSNI six-inch County Series, shown over the modern map.
_Avoid_: Old map, overlay, historic layer

**Nearby Article**:
A Wikipedia article whose coordinates fall within the **Search Area**.
_Avoid_: Wiki link, page
