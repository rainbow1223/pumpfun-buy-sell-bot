const pendingActions = {}


let USERS_INFO = {}

const getUserData = (chatId) => {
    if (!USERS_INFO[chatId]) {
        USERS_INFO[chatId] = {}
    }
    return USERS_INFO[chatId]
}


module.exports = {
    currentSolPrice: 0,
    tokensForDetect: new Array(),
    poolsForDetect: new Array(),
    pendingActions,
    getUserData
};