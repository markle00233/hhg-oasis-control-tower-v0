import { Label, Select } from "@/components/ui";
import { SALES_PEOPLE } from "@/config/crm.config";

export function SalesPersonSelect({
  name = "salesPersonCode",
  defaultValue = SALES_PEOPLE[0].code,
  required = false,
}: {
  name?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={name}>NV kinh doanh (Sale) {required ? "*" : ""}</Label>
      <Select id={name} name={name} defaultValue={defaultValue} required={required}>
        {SALES_PEOPLE.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
