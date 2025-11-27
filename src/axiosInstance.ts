import axios, { AxiosError, AxiosHeaders, AxiosResponse, InternalAxiosRequestConfig } from "axios";

const axiosInstance = axios.create({
  baseURL: "http://localhost:8002/api/",
});

axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const accessToken = localStorage.getItem("access_token");
    if (accessToken) {
      const headers = new AxiosHeaders(config.headers);
      headers.set("Authorization", `Bearer ${accessToken}`);
      config.headers = headers;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config;
    const refreshToken = localStorage.getItem("refresh_token");

    if (error.response?.status === 401 && refreshToken && originalRequest) {
      try {
        const response = await axios.post("http://localhost:8002/api/token/refresh/", {
          refresh: refreshToken,
        });
        const access = response.data.access as string;
        localStorage.setItem("access_token", access);
        axiosInstance.defaults.headers.common["Authorization"] = `Bearer ${access}`;
        const headers = new AxiosHeaders(originalRequest.headers);
        headers.set("Authorization", `Bearer ${access}`);
        originalRequest.headers = headers;
        return axiosInstance(originalRequest);
      } catch (err) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
