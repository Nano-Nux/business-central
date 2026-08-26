"use client";

import { useState } from "react";
import { addDateOnlyDays, dateOnlyDaysBetween } from "@/lib/date-time";
import { Field } from "./ui";

export function RepairWaitingFields({
  startDate,
  initialDays = 0,
  initialEndDate,
  daysName,
  endDateName,
  onChange,
}: {
  startDate: string;
  initialDays?: number;
  initialEndDate?: string;
  daysName: string;
  endDateName: string;
  onChange?: (days: number, endDate: string) => void;
}) {
  const [days, setDays] = useState(String(Math.max(0, initialDays)));
  const [endDate, setEndDate] = useState(
    initialEndDate || addDateOnlyDays(startDate, Math.max(0, initialDays)),
  );

  return (
    <>
      <Field label="Waiting start date">
        <input value={startDate} type="date" readOnly />
      </Field>
      <Field label="Waiting time (days)">
        <input
          name={daysName}
          type="number"
          min="0"
          step="1"
          value={days}
          onChange={(event) => {
            const nextDays = Math.max(0, Number(event.target.value || 0));
            const nextEndDate = addDateOnlyDays(startDate, nextDays);
            setDays(event.target.value);
            setEndDate(nextEndDate);
            onChange?.(nextDays, nextEndDate);
          }}
          required
        />
      </Field>
      <Field label="Waiting end date">
        <input
          name={endDateName}
          type="date"
          min={startDate}
          value={endDate}
          onChange={(event) => {
            const nextEndDate = event.target.value;
            const nextDays = dateOnlyDaysBetween(startDate, nextEndDate);
            setEndDate(nextEndDate);
            setDays(String(nextDays));
            onChange?.(nextDays, nextEndDate);
          }}
          required
        />
      </Field>
    </>
  );
}
