# Postcode History

A static website that takes a Northern Ireland **Postcode** and shows the history of the surrounding area: **Heritage Records** nearby, **Historical Maps**, and **Nearby Articles**.

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

## Maps and articles

**Historical Map**:
One edition of the OSNI six-inch County Series, shown over the modern map.
_Avoid_: Old map, overlay, historic layer

**Nearby Article**:
A Wikipedia article whose coordinates fall within the **Search Area**.
_Avoid_: Wiki link, page
