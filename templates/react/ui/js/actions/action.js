export const UPDATE = "UPDATE";
export const NAVIGATE = "NAVIGATE";

export function update(data) {
	return {
		type: UPDATE,
		data: data
	};
}

export function navigateTo(page) {
	return {
		type: NAVIGATE,
		page
	};
}