const Axios = require("axios").default;

const axios = Axios.create({
	timeout: 10000,
});
axios.interceptors.response.use((res) => {
	if (res.data.code == null) return res;
	if (res.data.code == 0) return res.data.data;
	throw res.data;
});
exports.axios = axios;
