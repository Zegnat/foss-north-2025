import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
	calendarMethods,
	generateIcsCalendar,
	type IcsDateObject,
} from "ts-ics";
import {
	array,
	object,
	optional,
	picklist,
	pipe,
	regex,
	string,
	parse as validateData,
} from "valibot";
import { parse as yamlParse } from "yaml";

type ShortEvent = {
	summary: string;
	description?: string;
	start: IcsDateObject;
	end: IcsDateObject;
	location: "RunAn" | "Scania" | undefined;
};

const createIcsDateObject = (date: Date) => {
	return {
		date,
		type: "DATE-TIME",
		local: {
			date,
			timezone: "/Europe/Berlin",
			tzoffset: "2",
		},
	} satisfies IcsDateObject;
};

const dateTime = (day: number, time: string) => {
	if (day !== 14 && day !== 15) {
		throw new Error("foss-north 2025 happens during april 14 and 15.");
	}
	if (/\d\d:\d\d/.test(time) === false) {
		throw new Error('"time" must be a valid hh:mm string.');
	}
	return createIcsDateObject(new Date(`2025-04-${day}T${time}+0200`));
};

const hoursToTime = (hours: number) => {
	// ts-ics has broken timezone support, so it always falls back to UTC.
	// Hard-code the offset here...
	const tzoffset = 2;
	return `${Math.floor(hours) + tzoffset}:${hours % 1 === 0 ? "00" : "30"}`.padStart(
		5,
		"0",
	);
};

const md5 = (event: ShortEvent) => {
	const hash = createHash("md5");
	hash.update(event.summary);
	hash.update(event.start.date.getTime().toString());
	hash.update(event.end.date.getTime().toString());
	return hash.digest("base64url");
};

// Every VEVENT requires a creation date called stamp, use the current hour.
const stampDate = new Date();
stampDate.setMinutes(0);
stampDate.setSeconds(0);
stampDate.setHours(16);
const stamp = createIcsDateObject(stampDate);

const file = readFileSync(`${import.meta.dirname}/speakers.yaml`, "utf8");
const data = yamlParse(file) as unknown;

const SpeakersSchema = array(
	object({
		slot: optional(pipe(string(), regex(/^slot\d+(a|b)?$/))),
		name: string(),
		title: string(),
		day: optional(pipe(string(), picklist(["apr14", "apr15"]))),
		copresenters: optional(array(object({ name: string() }))),
		abstract: array(string()),
	}),
);
const speakers = validateData(SpeakersSchema, data);

const events: ShortEvent[] = speakers.flatMap((speaker) => {
	if (!speaker.slot || !speaker.day) {
		return [];
	}
	const slotNr = Number.parseInt(speaker.slot.replaceAll(/[^\d]+/g, ""), 10);
	// Slots marked with an a or b are half slots (30 minutes)
	const isShort = speaker.slot.endsWith("a") || speaker.slot.endsWith("b");
	// In a 2-track event, the evenness of the slot specifies the track (room)
	const isRunAn = slotNr % 2;

	// Calculate when a slot starts, this is not documented anywhere
	const slotStart = [
		8,
		Math.ceil(slotNr / 2), // For every 2 slots past we have progressed an hour
		Number(speaker.slot.endsWith("b")) / 2, // If it is a b slot, add half an hour to follow the a slot within the same hour
	];
	if (speaker.day === "apr14") {
		slotStart.push(
			...[
				Number(slotNr > 12) / 2, // There is a half hour coffee break after slot 12
			],
		);
	}
	if (speaker.day === "apr15") {
		slotStart.push(
			...[
				Number(slotNr > 6), // There is an hour lunch break after slot 6
				Number(slotNr > 8) / -2, // Slots 9 and 10 start half an hour earlier for the coffee break
				Number(slotNr > 10) / 2, // Bring the slots back onto full hours after the coffee break
			],
		);
	}
	const startHour = slotStart.reduce((total, now) => total + now);
	const startTime = hoursToTime(startHour);

	// End time is easier, but only a little
	const slotEnd = [startHour, isShort ? 0.5 : 1];
	if (speaker.day === "apr14") {
		slotEnd.push(
			...[
				Number(slotNr > 14) / -2, // Slots 15 and 16 are half our slots without an a/b marking
			],
		);
	}
	if (speaker.day === "apr15") {
		slotEnd.push(
			...[
				slotNr === 7 || slotNr === 8 ? -0.5 : 0, // Slots 7 and 8 are half our slots without an a/b marking
			],
		);
	}
	const endHour = slotEnd.reduce((total, now) => total + now);
	const endTime = hoursToTime(endHour);

	const speakers = [speaker.name]
		.concat(speaker.copresenters?.map((presenter) => presenter.name) ?? [])
		.join(", ");

	return {
		summary: `${speaker.title} (${speakers})`,
		start: dateTime(speaker.day === "apr14" ? 14 : 15, startTime),
		end: dateTime(speaker.day === "apr14" ? 14 : 15, endTime),
		location: isRunAn ? "RunAn" : "Scania",
		description: speaker.abstract.join("\n\n"),
	};
});

// Manual entries not included in the speakers.yaml
events.push(
	...[
		{
			summary: "Registration / Mingle",
			start: dateTime(14, hoursToTime(8.5)),
			end: dateTime(14, hoursToTime(9)),
			location: undefined,
		},
		{
			summary: "Lunch",
			start: dateTime(14, hoursToTime(12)),
			end: dateTime(14, hoursToTime(13)),
			location: undefined,
		},
		{
			summary: "Coffee break",
			start: dateTime(14, hoursToTime(15)),
			end: dateTime(14, hoursToTime(15.5)),
			location: undefined,
		},
		{
			summary: "Registration / Mingle",
			start: dateTime(15, hoursToTime(8.5)),
			end: dateTime(15, hoursToTime(9)),
			location: undefined,
		},
		{
			summary: "Lunch",
			start: dateTime(15, hoursToTime(12)),
			end: dateTime(15, hoursToTime(13)),
			location: undefined,
		},
		{
			summary: "Coffee break",
			start: dateTime(15, hoursToTime(14.5)),
			end: dateTime(15, hoursToTime(15)),
			location: undefined,
		},
	],
);

const eventSorter = (a: ShortEvent, b: ShortEvent) => {
	if (a.start.date.getDate() !== b.start.date.getDate()) {
		return a.start.date.getDate() - b.start.date.getDate();
	}
	if (a.end.date.getTime() !== b.end.date.getTime()) {
		return a.end.date.getTime() - b.end.date.getTime();
	}
	if (a.location !== b.location) {
		return a.location === "RunAn" ? -1 : 1;
	}
	return 0;
};

process.stdout.write(
	generateIcsCalendar({
		version: "2.0",
		prodId: "-//net.zegnat//foss-north 2025 Calendar//EN",
		name: "foss-north 2025",
		method: calendarMethods[0],
		events: events.sort(eventSorter).map((event) => {
			return {
				summary: event.summary,
				start: event.start,
				end: event.end,
				location: (event.location ? `${event.location}, ` : "").concat(
					"Chalmersplatsen 1, 412 58 Göteborg",
				),
				stamp,
				...(event.description ? { description: event.description } : {}),
				uid: `net.zegnat.se.foss-north.2025.${md5(event)}`,
			};
		}),
	}).replaceAll(/(:\d{8}T\d{6})Z$/gm, "$1"),
);
