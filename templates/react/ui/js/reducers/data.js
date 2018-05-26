import {
    UPDATE
} from '../actions/action.js';

export default function state(state = [], action) {
    switch (action.type) {
        case UPDATE:
            return action.data;
        default:
            return state
    }
}